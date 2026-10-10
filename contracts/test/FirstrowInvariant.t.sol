// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {Firstrow} from "../src/Firstrow.sol";
import {IERC3009} from "../src/interfaces/IERC3009.sol";
import {MockAusd} from "./mocks/MockAusd.sol";

contract Handler is Test {
    Firstrow immutable firstrow;
    MockAusd immutable ausd;
    address immutable host;

    uint256[] public eventIds;
    uint256[3] fanKeys;
    uint256 nonceSalt;

    constructor(Firstrow f, MockAusd a, address h) {
        firstrow = f;
        ausd = a;
        host = h;
        for (uint256 i; i < 3; ++i) {
            (, fanKeys[i]) = makeAddrAndKey(string.concat("fan", vm.toString(i)));
            ausd.mint(vm.addr(fanKeys[i]), 1e15);
        }
    }

    function eventCount() external view returns (uint256) {
        return eventIds.length;
    }

    function createEvent(uint128 price, uint16 cap, uint16 royalty, uint8 presaleShows) external {
        if (eventIds.length >= 4) return;
        Firstrow.TierParams[] memory tiers = new Firstrow.TierParams[](2);
        tiers[0] = Firstrow.TierParams({price: uint128(bound(price, 0, 500e6)), supply: 20});
        tiers[1] = Firstrow.TierParams({price: uint128(bound(price, 0, 500e6)) * 2, supply: 5});
        Firstrow.EventParams memory p = Firstrow.EventParams({
            metadataURI: "",
            startsAt: uint64(block.timestamp + 1 days),
            endsAt: uint64(block.timestamp + 1 days + 4 hours),
            saleStartsAt: uint64(block.timestamp),
            presaleStartsAt: uint64(block.timestamp),
            presaleMinShows: uint16(bound(presaleShows, 0, 1)),
            resaleCapBps: uint16(bound(cap, 0, 5000)),
            royaltyBps: uint16(bound(royalty, 0, 2000))
        });
        vm.prank(host);
        eventIds.push(firstrow.createEvent(p, tiers));
    }

    function buy(uint256 eventSeed, uint256 fanSeed, uint8 tier, uint8 quantity) external {
        if (eventIds.length == 0) return;
        uint256 id = eventIds[eventSeed % eventIds.length];
        uint256 key = fanKeys[fanSeed % 3];
        tier = uint8(bound(tier, 0, 1));
        quantity = uint8(bound(quantity, 1, 3));
        (, Firstrow.Tier[] memory tiers) = firstrow.getEvent(id);
        Firstrow.Authorization memory a = _auth(key, uint256(tiers[tier].price) * quantity);
        vm.prank(vm.addr(key));
        try firstrow.buy(id, tier, quantity, address(0), a) {} catch {}
    }

    function checkIn(uint256 ticketSeed) external {
        uint256 count = firstrow.ticketCount();
        if (count == 0) return;
        uint256 ticketId = ticketSeed % count + 1;
        Firstrow.Ticket memory tk = firstrow.getTicket(ticketId);
        uint256 key = _keyOf(tk.owner);
        if (key == 0) return;
        uint256[] memory ids = new uint256[](1);
        ids[0] = ticketId;
        uint256 deadline = block.timestamp + 5 minutes;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, firstrow.checkInDigest(tk.eventId, ids, deadline));
        vm.prank(host);
        try firstrow.checkIn(tk.eventId, ids, deadline, abi.encodePacked(r, s, v)) {} catch {}
    }

    function refund(uint256 ticketSeed) external {
        uint256 count = firstrow.ticketCount();
        if (count == 0) return;
        uint256 ticketId = ticketSeed % count + 1;
        address owner = firstrow.getTicket(ticketId).owner;
        uint256[] memory ids = new uint256[](1);
        ids[0] = ticketId;
        vm.prank(owner);
        try firstrow.refund(ids, owner) {} catch {}
    }

    function list(uint256 ticketSeed, uint256 price) external {
        uint256 count = firstrow.ticketCount();
        if (count == 0) return;
        uint256 ticketId = ticketSeed % count + 1;
        address owner = firstrow.getTicket(ticketId).owner;
        vm.prank(owner);
        try firstrow.list(ticketId, bound(price, 0, 1_500e6)) {} catch {}
    }

    function buyResale(uint256 ticketSeed, uint256 fanSeed) external {
        uint256 count = firstrow.ticketCount();
        if (count == 0) return;
        uint256 ticketId = ticketSeed % count + 1;
        uint256 key = fanKeys[fanSeed % 3];
        Firstrow.Authorization memory a = _auth(key, firstrow.listingPrice(ticketId));
        vm.prank(vm.addr(key));
        try firstrow.buyResale(ticketId, address(0), a) {} catch {}
    }

    function cancel(uint256 eventSeed) external {
        if (eventIds.length == 0) return;
        vm.prank(host);
        try firstrow.cancelEvent(eventIds[eventSeed % eventIds.length]) {} catch {}
    }

    function withdraw(uint256 eventSeed) external {
        if (eventIds.length == 0) return;
        vm.prank(host);
        try firstrow.withdraw(eventIds[eventSeed % eventIds.length], host) {} catch {}
    }

    function warp(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1 minutes, 3 days));
    }

    function _keyOf(address owner) private view returns (uint256) {
        for (uint256 i; i < 3; ++i) {
            if (vm.addr(fanKeys[i]) == owner) return fanKeys[i];
        }
        return 0;
    }

    function _auth(uint256 key, uint256 value) private returns (Firstrow.Authorization memory a) {
        a.validBefore = block.timestamp + 1 hours;
        a.nonce = keccak256(abi.encode(++nonceSalt));
        bytes32 structHash = keccak256(
            abi.encode(
                ausd.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(),
                vm.addr(key),
                address(firstrow),
                value,
                0,
                a.validBefore,
                a.nonce
            )
        );
        (a.v, a.r, a.s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash)));
    }
}

contract FirstrowInvariantTest is Test {
    Firstrow firstrow;
    MockAusd ausd;
    Handler handler;

    function setUp() public {
        vm.warp(1_000_000);
        ausd = new MockAusd();
        firstrow = new Firstrow(IERC3009(address(ausd)), address(new ERC2771Forwarder("Firstrow")));
        handler = new Handler(firstrow, ausd, makeAddr("host"));
        targetContract(address(handler));
    }

    /// The contract holds exactly what it still owes: unresolved escrow plus everything hosts earned and
    /// haven't withdrawn.
    function invariant_balanceMatchesOwed() public view {
        uint256 owed;
        for (uint256 i; i < handler.eventCount(); ++i) {
            (Firstrow.Event memory e,) = firstrow.getEvent(handler.eventIds(i));
            owed += uint256(e.validValue) + e.checkedInValue + e.royalties - e.paidOut;
        }
        assertEq(ausd.balanceOf(address(firstrow)), owed);
    }

    /// Escrow counters agree with the face value of the tickets in each status.
    function invariant_countersMatchTickets() public view {
        uint256 n = handler.eventCount();
        uint256[] memory valid = new uint256[](n + 1);
        uint256[] memory checked = new uint256[](n + 1);
        for (uint256 id = 1; id <= firstrow.ticketCount(); ++id) {
            Firstrow.Ticket memory tk = firstrow.getTicket(id);
            (, Firstrow.Tier[] memory tiers) = firstrow.getEvent(tk.eventId);
            if (tk.status == Firstrow.Status.Valid) valid[tk.eventId] += tiers[tk.tier].price;
            if (tk.status == Firstrow.Status.CheckedIn) checked[tk.eventId] += tiers[tk.tier].price;
        }
        for (uint256 i; i < n; ++i) {
            uint256 eventId = handler.eventIds(i);
            (Firstrow.Event memory e,) = firstrow.getEvent(eventId);
            assertEq(e.validValue, valid[eventId]);
            assertEq(e.checkedInValue, checked[eventId]);
        }
    }

    /// A host can never withdraw more than the contract holds.
    function invariant_hostBalanceIsCovered() public view {
        uint256 total;
        for (uint256 i; i < handler.eventCount(); ++i) {
            total += firstrow.hostBalance(handler.eventIds(i));
        }
        assertLe(total, ausd.balanceOf(address(firstrow)));
    }

    /// Listed tickets are always valid and owned.
    function invariant_listingsAreValid() public view {
        for (uint256 i; i < handler.eventCount(); ++i) {
            uint256[] memory listed = firstrow.listingsOf(handler.eventIds(i), 0, 1000);
            for (uint256 j; j < listed.length; ++j) {
                assertTrue(firstrow.isListed(listed[j]));
                assertEq(uint8(firstrow.getTicket(listed[j]).status), uint8(Firstrow.Status.Valid));
            }
        }
    }
}
