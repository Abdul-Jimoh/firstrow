// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {Firstrow} from "../src/Firstrow.sol";
import {IERC3009} from "../src/interfaces/IERC3009.sol";

contract Deploy is Script {
    function run() external returns (ERC2771Forwarder forwarder, Firstrow firstrow) {
        address ausd = ausdFor(block.chainid);

        vm.startBroadcast();
        forwarder = new ERC2771Forwarder("Firstrow");
        firstrow = new Firstrow(IERC3009(ausd), address(forwarder));
        vm.stopBroadcast();

        console.log("chain", block.chainid);
        console.log("forwarder", address(forwarder));
        console.log("firstrow", address(firstrow));
    }

    function ausdFor(uint256 chainId) public pure returns (address) {
        if (chainId == 143) return 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a;
        if (chainId == 10143) return 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
        revert("unsupported chain");
    }
}
