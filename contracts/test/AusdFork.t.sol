// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {Firstrow} from "../src/Firstrow.sol";
import {IERC3009} from "../src/interfaces/IERC3009.sol";

interface IAusd is IERC3009 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

interface IFaucet {
    function requestFunds(address) external;
}

/// Buys a ticket with real AUSD on a fork of Monad testnet.
contract AusdForkTest is Test {
    IAusd constant AUSD = IAusd(0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC);
    IFaucet constant FAUCET = IFaucet(0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C);
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    function test_buyWithRealAusd() public {
        vm.createSelectFork("monad_testnet");
        Firstrow firstrow = new Firstrow(AUSD, address(new ERC2771Forwarder("Firstrow")));
        (address fan, uint256 key) = makeAddrAndKey("fan");
        FAUCET.requestFunds(fan);

        Firstrow.TierParams[] memory tiers = new Firstrow.TierParams[](1);
        tiers[0] = Firstrow.TierParams({price: 5e6, supply: 10});
        uint256 id = firstrow.createEvent(
            Firstrow.EventParams({
                metadataURI: "",
                startsAt: uint64(block.timestamp + 1 days),
                endsAt: uint64(block.timestamp + 2 days),
                saleStartsAt: uint64(block.timestamp),
                presaleStartsAt: uint64(block.timestamp),
                presaleMinShows: 0,
                resaleCapBps: 0,
                royaltyBps: 0
            }),
            tiers
        );

        Firstrow.Authorization memory a;
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = keccak256("order-1");
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, fan, address(firstrow), 5e6, 0, a.validBefore, a.nonce));
        (a.v, a.r, a.s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", AUSD.DOMAIN_SEPARATOR(), structHash)));

        vm.prank(fan);
        firstrow.buy(id, 0, 1, address(0), a);
        assertEq(AUSD.balanceOf(address(firstrow)), 5e6);
        assertEq(firstrow.getTicket(1).owner, fan);
    }
}
