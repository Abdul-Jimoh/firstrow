// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {Firstrow} from "../src/Firstrow.sol";
import {IERC3009} from "../src/interfaces/IERC3009.sol";
import {MockAusd} from "./mocks/MockAusd.sol";

abstract contract Base is Test {
    bytes32 constant FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
    );
    bytes32 constant CHECK_IN_TYPEHASH = keccak256("CheckIn(uint256 eventId,uint256[] ticketIds,uint256 deadline)");

    uint128 constant PRICE = 25e6;
    uint64 constant START = 10 days;

    MockAusd ausd;
    ERC2771Forwarder forwarder;
    Firstrow firstrow;

    address host;
    uint256 hostKey;
    address door;
    uint256 doorKey;
    address fan;
    uint256 fanKey;
    address fan2;
    uint256 fan2Key;
    address relayer = makeAddr("relayer");

    uint256 nonceSalt;

    function setUp() public virtual {
        vm.warp(1_000_000);
        (host, hostKey) = makeAddrAndKey("host");
        (door, doorKey) = makeAddrAndKey("door");
        (fan, fanKey) = makeAddrAndKey("fan");
        (fan2, fan2Key) = makeAddrAndKey("fan2");

        ausd = new MockAusd();
        forwarder = new ERC2771Forwarder("Firstrow");
        firstrow = new Firstrow(IERC3009(address(ausd)), address(forwarder));

        ausd.mint(fan, 1_000e6);
        ausd.mint(fan2, 1_000e6);
    }

    function _params(uint16 cap, uint16 royalty) internal view returns (Firstrow.EventParams memory) {
        return Firstrow.EventParams({
            metadataURI: "ipfs://event",
            startsAt: uint64(block.timestamp + START),
            endsAt: uint64(block.timestamp + START + 4 hours),
            saleStartsAt: uint64(block.timestamp),
            presaleStartsAt: uint64(block.timestamp),
            presaleMinShows: 0,
            resaleCapBps: cap,
            royaltyBps: royalty
        });
    }

    function _tiers(uint128 price, uint32 supply) internal pure returns (Firstrow.TierParams[] memory t) {
        t = new Firstrow.TierParams[](1);
        t[0] = Firstrow.TierParams({price: price, supply: supply});
    }

    function _createEvent() internal returns (uint256 id) {
        vm.prank(host);
        id = firstrow.createEvent(_params(0, 500), _tiers(PRICE, 100));
    }

    function _auth(uint256 key, address to, uint256 value) internal returns (Firstrow.Authorization memory a) {
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = keccak256(abi.encode(++nonceSalt));
        bytes32 structHash = keccak256(
            abi.encode(ausd.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), vm.addr(key), to, value, 0, a.validBefore, a.nonce)
        );
        (a.v, a.r, a.s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash)));
    }

    function _buy(uint256 key, uint256 eventId, uint256 quantity, address dk) internal returns (uint256 first) {
        Firstrow.Authorization memory a = _auth(key, address(firstrow), PRICE * quantity);
        vm.prank(vm.addr(key));
        first = firstrow.buy(eventId, 0, quantity, dk, a);
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = a;
    }

    function _checkInSig(uint256 key, uint256 eventId, uint256[] memory ids, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = firstrow.checkInDigest(eventId, ids, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _checkIn(uint256 signerKey, uint256 eventId, uint256[] memory ids) internal {
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(signerKey, eventId, ids, deadline);
        vm.prank(host);
        firstrow.checkIn(eventId, ids, deadline, sig);
    }

    function _forwardRequest(uint256 key, bytes memory data)
        internal
        view
        returns (ERC2771Forwarder.ForwardRequestData memory req)
    {
        address from = vm.addr(key);
        req = ERC2771Forwarder.ForwardRequestData({
            from: from,
            to: address(firstrow),
            value: 0,
            gas: 1_000_000,
            deadline: uint48(block.timestamp + 1 hours),
            data: data,
            signature: ""
        });
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = forwarder.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                FORWARD_REQUEST_TYPEHASH,
                req.from,
                req.to,
                req.value,
                req.gas,
                forwarder.nonces(from),
                req.deadline,
                keccak256(req.data)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        req.signature = abi.encodePacked(r, s, v);
    }

    function _relay(uint256 key, bytes memory data) internal {
        ERC2771Forwarder.ForwardRequestData memory req = _forwardRequest(key, data);
        vm.prank(relayer);
        forwarder.execute(req);
    }
}
