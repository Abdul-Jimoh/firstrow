// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

interface IAusd {
    function balanceOf(address) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

interface IFaucet {
    function requestFunds(address) external;
}

contract Receiver {
    function pull(IAusd ausd, address from, uint256 value, uint256 before, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
        external
    {
        ausd.receiveWithAuthorization(from, address(this), value, 0, before, nonce, v, r, s);
    }
}

contract AusdForkTest is Test {
    IAusd constant AUSD = IAusd(0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC);
    IFaucet constant FAUCET = IFaucet(0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C);
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    function setUp() public {
        vm.createSelectFork("monad_testnet");
    }

    function test_receiveWithAuthorization() public {
        (address fan, uint256 key) = makeAddrAndKey("fan");
        FAUCET.requestFunds(fan);
        uint256 funded = AUSD.balanceOf(fan);
        assertGt(funded, 0);

        Receiver receiver = new Receiver();
        uint256 value = 1e6;
        uint256 before = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("ticket-1");
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, fan, address(receiver), value, 0, before, nonce));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", AUSD.DOMAIN_SEPARATOR(), structHash)));

        receiver.pull(AUSD, fan, value, before, nonce, v, r, s);
        assertEq(AUSD.balanceOf(address(receiver)), value);
        assertEq(AUSD.balanceOf(fan), funded - value);
    }
}
