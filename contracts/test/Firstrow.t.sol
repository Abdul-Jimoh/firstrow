// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Base} from "./Base.t.sol";
import {Firstrow} from "../src/Firstrow.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

contract FirstrowTest is Base {
    // create

    function test_createEvent() public {
        uint256 id = _createEvent();
        (Firstrow.Event memory e, Firstrow.Tier[] memory tiers) = firstrow.getEvent(id);
        assertEq(e.host, host);
        assertEq(e.royaltyBps, 500);
        assertEq(tiers.length, 1);
        assertEq(tiers[0].price, PRICE);
    }

    function test_createEvent_rejectsBadSchedule() public {
        Firstrow.EventParams memory p = _params(0, 0);
        p.startsAt = uint64(block.timestamp);
        vm.expectRevert(Firstrow.InvalidSchedule.selector);
        firstrow.createEvent(p, _tiers(PRICE, 1));

        p = _params(0, 0);
        p.endsAt = p.startsAt + 31 days;
        vm.expectRevert(Firstrow.InvalidSchedule.selector);
        firstrow.createEvent(p, _tiers(PRICE, 1));

        p = _params(0, 0);
        p.presaleStartsAt = p.saleStartsAt + 1;
        vm.expectRevert(Firstrow.InvalidSchedule.selector);
        firstrow.createEvent(p, _tiers(PRICE, 1));
    }

    function test_createEvent_rejectsBadTiersAndFees() public {
        vm.expectRevert(Firstrow.InvalidTiers.selector);
        firstrow.createEvent(_params(0, 0), new Firstrow.TierParams[](0));

        vm.expectRevert(Firstrow.InvalidTiers.selector);
        firstrow.createEvent(_params(0, 0), _tiers(PRICE, 0));

        vm.expectRevert(Firstrow.InvalidFees.selector);
        firstrow.createEvent(_params(0, 2001), _tiers(PRICE, 1));

        vm.expectRevert(Firstrow.InvalidFees.selector);
        firstrow.createEvent(_params(5001, 0), _tiers(PRICE, 1));
    }

    function test_updateMetadata_hostOnlyAndBeforeEnd() public {
        uint256 id = _createEvent();
        vm.prank(fan);
        vm.expectRevert(Firstrow.NotHost.selector);
        firstrow.updateMetadata(id, "ipfs://new");

        vm.prank(host);
        firstrow.updateMetadata(id, "ipfs://new");
        (Firstrow.Event memory e,) = firstrow.getEvent(id);
        assertEq(e.metadataURI, "ipfs://new");
        // Nothing a buyer relied on has moved.
        assertEq(e.startsAt, uint64(block.timestamp + START));
        assertEq(e.royaltyBps, 500);

        vm.warp(e.endsAt);
        vm.prank(host);
        vm.expectRevert(Firstrow.SaleClosed.selector);
        firstrow.updateMetadata(id, "ipfs://late");
    }

    // buy

    function test_buy_pullsAusdIntoEscrow() public {
        uint256 id = _createEvent();
        uint256 first = _buy(fanKey, id, 2, address(0));

        assertEq(first, 1);
        assertEq(ausd.balanceOf(address(firstrow)), PRICE * 2);
        assertEq(ausd.balanceOf(host), 0);
        assertEq(firstrow.getTicket(2).owner, fan);
        assertEq(firstrow.ticketCountOf(fan), 2);
        (Firstrow.Event memory e,) = firstrow.getEvent(id);
        assertEq(e.validValue, PRICE * 2);
        assertEq(e.sold, 2);
    }

    function test_buy_rejectsWhenSoldOut() public {
        vm.prank(host);
        uint256 id = firstrow.createEvent(_params(0, 0), _tiers(PRICE, 2));
        _buy(fanKey, id, 2, address(0));

        Firstrow.Authorization memory a = _auth(fan2Key, address(firstrow), PRICE);
        vm.prank(fan2);
        vm.expectRevert(Firstrow.SoldOut.selector);
        firstrow.buy(id, 0, 1, address(0), a);
    }

    function test_buy_rejectsAuthorizationFromSomeoneElse() public {
        uint256 id = _createEvent();
        Firstrow.Authorization memory a = _auth(fanKey, address(firstrow), PRICE);
        // fan2 can't spend fan's authorization: the contract always pulls from the caller.
        vm.prank(fan2);
        vm.expectRevert("invalid signature");
        firstrow.buy(id, 0, 1, address(0), a);
    }

    function test_buy_rejectsQuantity() public {
        uint256 id = _createEvent();
        Firstrow.Authorization memory a = _auth(fanKey, address(firstrow), 0);
        vm.startPrank(fan);
        vm.expectRevert(Firstrow.InvalidQuantity.selector);
        firstrow.buy(id, 0, 0, address(0), a);
        vm.expectRevert(Firstrow.InvalidQuantity.selector);
        firstrow.buy(id, 0, 11, address(0), a);
        vm.expectRevert(Firstrow.UnknownTier.selector);
        firstrow.buy(id, 1, 1, address(0), a);
        vm.stopPrank();
    }

    function test_buy_freeTicketNeedsNoPayment() public {
        vm.prank(host);
        uint256 id = firstrow.createEvent(_params(0, 0), _tiers(0, 50));
        Firstrow.Authorization memory empty;
        vm.prank(fan);
        firstrow.buy(id, 0, 1, address(0), empty);
        assertEq(firstrow.getTicket(1).owner, fan);
    }

    function test_buy_closedAfterEnd() public {
        uint256 id = _createEvent();
        vm.warp(block.timestamp + START + 4 hours);
        Firstrow.Authorization memory a = _auth(fanKey, address(firstrow), PRICE);
        vm.prank(fan);
        vm.expectRevert(Firstrow.SaleClosed.selector);
        firstrow.buy(id, 0, 1, address(0), a);
    }

    // presale for returning fans

    function test_presale_onlyForReturningFans() public {
        uint256 first = _createEvent();
        uint256 t = _buy(fanKey, first, 1, address(0));
        vm.warp(block.timestamp + START);
        _checkIn(fanKey, first, _ids(t));

        Firstrow.EventParams memory p = _params(0, 0);
        p.presaleMinShows = 1;
        p.saleStartsAt = uint64(block.timestamp + 2 days);
        p.presaleStartsAt = uint64(block.timestamp);
        vm.prank(host);
        uint256 second = firstrow.createEvent(p, _tiers(PRICE, 10));

        _buy(fanKey, second, 1, address(0));

        Firstrow.Authorization memory a = _auth(fan2Key, address(firstrow), PRICE);
        vm.prank(fan2);
        vm.expectRevert(Firstrow.PresaleLocked.selector);
        firstrow.buy(second, 0, 1, address(0), a);

        vm.warp(p.saleStartsAt);
        _buy(fan2Key, second, 1, address(0));
    }

    function test_presale_notOpenYet() public {
        Firstrow.EventParams memory p = _params(0, 0);
        p.saleStartsAt = uint64(block.timestamp + 1 days);
        p.presaleStartsAt = uint64(block.timestamp + 1 hours);
        p.presaleMinShows = 1;
        vm.prank(host);
        uint256 id = firstrow.createEvent(p, _tiers(PRICE, 10));

        Firstrow.Authorization memory a = _auth(fanKey, address(firstrow), PRICE);
        vm.prank(fan);
        vm.expectRevert(Firstrow.SaleNotOpen.selector);
        firstrow.buy(id, 0, 1, address(0), a);
    }

    // check-in

    function test_checkIn_releasesValueToHost() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);
        _checkIn(fanKey, id, _ids(t));

        assertEq(uint8(firstrow.getTicket(t).status), uint8(Firstrow.Status.CheckedIn));
        assertEq(firstrow.hostBalance(id), PRICE);

        vm.prank(host);
        firstrow.withdraw(id, host);
        assertEq(ausd.balanceOf(host), PRICE);
        assertEq(firstrow.hostBalance(id), 0);
    }

    function test_checkIn_withDoorKey() public {
        (address dk, uint256 dkKey) = makeAddrAndKey("fan-door-key");
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, dk);
        assertEq(firstrow.doorKeyOf(id, fan), dk);

        vm.warp(block.timestamp + START);
        _checkIn(dkKey, id, _ids(t));
        assertEq(uint8(firstrow.getTicket(t).status), uint8(Firstrow.Status.CheckedIn));
    }

    function test_checkIn_doorKeyIsScopedToItsEvent() public {
        (address dk, uint256 dkKey) = makeAddrAndKey("fan-door-key");
        uint256 a = _createEvent();
        uint256 b = _createEvent();
        _buy(fanKey, a, 1, dk);
        uint256 tb = _buy(fanKey, b, 1, address(0));

        vm.warp(block.timestamp + START);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(dkKey, b, _ids(tb), deadline);
        vm.prank(host);
        vm.expectRevert(Firstrow.InvalidSignature.selector);
        firstrow.checkIn(b, _ids(tb), deadline, sig);
    }

    function test_checkIn_byPairedDoor() public {
        uint256 id = _createEvent();
        vm.prank(host);
        firstrow.setDoor(id, door, true);
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);

        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(fanKey, id, _ids(t), deadline);
        vm.prank(door);
        firstrow.checkIn(id, _ids(t), deadline, sig);
    }

    function test_checkIn_rejectsUnpairedCaller() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(fanKey, id, _ids(t), deadline);
        vm.prank(door);
        vm.expectRevert(Firstrow.NotDoor.selector);
        firstrow.checkIn(id, _ids(t), deadline, sig);
    }

    function test_checkIn_hostCannotForgeAttendance() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(hostKey, id, _ids(t), deadline);
        vm.prank(host);
        vm.expectRevert(Firstrow.InvalidSignature.selector);
        firstrow.checkIn(id, _ids(t), deadline, sig);
    }

    function test_checkIn_rejectsSignatureCollectedEarly() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);
        uint256 deadline = block.timestamp + 11 minutes;
        bytes memory sig = _checkInSig(fanKey, id, _ids(t), deadline);
        vm.prank(host);
        vm.expectRevert(Firstrow.SignatureTooEarly.selector);
        firstrow.checkIn(id, _ids(t), deadline, sig);
    }

    function test_checkIn_rejectsExpiredSignature() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(fanKey, id, _ids(t), deadline);
        vm.warp(deadline + 1);
        vm.prank(host);
        vm.expectRevert(Firstrow.SignatureExpired.selector);
        firstrow.checkIn(id, _ids(t), deadline, sig);
    }

    function test_checkIn_onlyInsideWindow() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START - 7 hours);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(fanKey, id, _ids(t), deadline);
        vm.prank(host);
        vm.expectRevert(Firstrow.CheckInClosed.selector);
        firstrow.checkIn(id, _ids(t), deadline, sig);
    }

    function test_checkIn_secondScanReverts() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);
        _checkIn(fanKey, id, _ids(t));

        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(fanKey, id, _ids(t), deadline);
        vm.prank(host);
        vm.expectRevert(Firstrow.TicketNotValid.selector);
        firstrow.checkIn(id, _ids(t), deadline, sig);
    }

    function test_checkIn_rejectsMixedOwners() public {
        uint256 id = _createEvent();
        uint256 a = _buy(fanKey, id, 1, address(0));
        uint256 b = _buy(fan2Key, id, 1, address(0));
        vm.warp(block.timestamp + START);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(fanKey, id, ids, deadline);
        vm.prank(host);
        vm.expectRevert(Firstrow.MixedOwners.selector);
        firstrow.checkIn(id, ids, deadline, sig);
    }

    function test_checkIn_groupCountsAsOneShow() public {
        uint256 id = _createEvent();
        uint256 first = _buy(fanKey, id, 3, address(0));
        vm.warp(block.timestamp + START);
        uint256[] memory ids = new uint256[](3);
        for (uint256 i; i < 3; ++i) {
            ids[i] = first + i;
        }
        _checkIn(fanKey, id, ids);

        Firstrow.Supporter memory s = firstrow.supporter(host, fan);
        assertEq(s.shows, 1);
        assertEq(s.number, 1);
        assertEq(firstrow.hostBalance(id), PRICE * 3);
    }

    function test_setDoorKey_replacesKey() public {
        (address dk, uint256 dkKey) = makeAddrAndKey("new-device");
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, makeAddr("old-device"));
        vm.prank(fan);
        firstrow.setDoorKey(id, dk);
        assertEq(firstrow.doorKeyOf(id, fan), dk);

        vm.warp(block.timestamp + START);
        _checkIn(dkKey, id, _ids(t));
    }

    function test_setDoor_rejectsZeroAndStrangers() public {
        uint256 id = _createEvent();
        vm.prank(host);
        vm.expectRevert(Firstrow.ZeroAddress.selector);
        firstrow.setDoor(id, address(0), true);
        vm.prank(fan);
        vm.expectRevert(Firstrow.NotHost.selector);
        firstrow.setDoor(id, door, true);
        vm.expectRevert(Firstrow.UnknownEvent.selector);
        firstrow.setDoor(99, door, true);
    }

    function test_ticketsOf_paginates() public {
        uint256 id = _createEvent();
        _buy(fanKey, id, 5, address(0));
        uint256[] memory page = firstrow.ticketsOf(fan, 3, 10);
        assertEq(page.length, 2);
        assertEq(page[0], 4);
        assertEq(page[1], 5);
        assertEq(firstrow.ticketsOf(fan, 5, 10).length, 0);
    }

    // early supporters

    function test_supporterNumbersFollowFirstCheckIn() public {
        uint256 a = _createEvent();
        uint256 t1 = _buy(fanKey, a, 1, address(0));
        uint256 t2 = _buy(fan2Key, a, 1, address(0));
        vm.warp(block.timestamp + START);
        _checkIn(fan2Key, a, _ids(t2));
        _checkIn(fanKey, a, _ids(t1));

        assertEq(firstrow.supporter(host, fan2).number, 1);
        assertEq(firstrow.supporter(host, fan).number, 2);
        assertEq(firstrow.supporterCount(host), 2);

        uint256 b = _createEvent();
        uint256 t3 = _buy(fanKey, b, 1, address(0));
        vm.warp(block.timestamp + START);
        _checkIn(fanKey, b, _ids(t3));

        Firstrow.Supporter memory s = firstrow.supporter(host, fan);
        assertEq(s.shows, 2);
        assertEq(s.number, 2);
    }

    // refunds

    function test_refund_afterCancel() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(host);
        firstrow.cancelEvent(id);

        uint256 before = ausd.balanceOf(fan);
        vm.prank(fan);
        firstrow.refund(_ids(t), fan);
        assertEq(ausd.balanceOf(fan), before + PRICE);
        assertEq(firstrow.hostBalance(id), 0);
    }

    function test_refund_notBeforeEventEnds() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(fan);
        vm.expectRevert(Firstrow.NotRefundable.selector);
        firstrow.refund(_ids(t), fan);
    }

    function test_refund_noShowWithinClaimWindow() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START + 4 hours + 1);
        vm.prank(fan);
        firstrow.refund(_ids(t), fan2);
        assertEq(ausd.balanceOf(fan2), 1_000e6 + PRICE);
    }

    function test_refund_closedAfterClaimWindow_hostCollects() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START + 4 hours + 7 days + 1);
        vm.prank(fan);
        vm.expectRevert(Firstrow.NotRefundable.selector);
        firstrow.refund(_ids(t), fan);

        assertEq(firstrow.hostBalance(id), PRICE);
    }

    function test_refund_checkedInTicketIsNotRefundable() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);
        _checkIn(fanKey, id, _ids(t));
        vm.warp(block.timestamp + 5 hours);
        vm.prank(fan);
        vm.expectRevert(Firstrow.TicketNotValid.selector);
        firstrow.refund(_ids(t), fan);
    }

    function test_refund_onlyOwner() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(host);
        firstrow.cancelEvent(id);
        vm.prank(fan2);
        vm.expectRevert(Firstrow.NotOwner.selector);
        firstrow.refund(_ids(t), fan2);
    }

    function test_refund_twiceReverts() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(host);
        firstrow.cancelEvent(id);
        vm.startPrank(fan);
        firstrow.refund(_ids(t), fan);
        vm.expectRevert(Firstrow.TicketNotValid.selector);
        firstrow.refund(_ids(t), fan);
        vm.stopPrank();
    }

    function test_cancel_blocksCheckInAndSales() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(host);
        firstrow.cancelEvent(id);

        Firstrow.Authorization memory a = _auth(fan2Key, address(firstrow), PRICE);
        vm.prank(fan2);
        vm.expectRevert(Firstrow.EventIsCancelled.selector);
        firstrow.buy(id, 0, 1, address(0), a);

        vm.warp(block.timestamp + START);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(fanKey, id, _ids(t), deadline);
        vm.prank(host);
        vm.expectRevert(Firstrow.EventIsCancelled.selector);
        firstrow.checkIn(id, _ids(t), deadline, sig);
    }

    function test_cancel_onlyHost() public {
        uint256 id = _createEvent();
        vm.prank(fan);
        vm.expectRevert(Firstrow.NotHost.selector);
        firstrow.cancelEvent(id);
    }

    function test_withdraw_onlyHostAndNotTwice() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.warp(block.timestamp + START);
        _checkIn(fanKey, id, _ids(t));

        vm.prank(fan);
        vm.expectRevert(Firstrow.NotHost.selector);
        firstrow.withdraw(id, fan);

        vm.startPrank(host);
        firstrow.withdraw(id, host);
        vm.expectRevert(Firstrow.NothingToWithdraw.selector);
        firstrow.withdraw(id, host);
        vm.stopPrank();
    }

    // resale

    function test_resale_movesTicketAndPaysRoyalty() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));

        vm.prank(fan);
        firstrow.list(t, PRICE);
        assertEq(firstrow.listingsOf(id, 0, 10).length, 1);

        uint256 sellerBefore = ausd.balanceOf(fan);
        (address dk,) = makeAddrAndKey("fan2-door");
        Firstrow.Authorization memory a = _auth(fan2Key, address(firstrow), PRICE);
        vm.prank(fan2);
        firstrow.buyResale(t, dk, a);

        uint256 royalty = PRICE * 500 / 10_000;
        assertEq(firstrow.getTicket(t).owner, fan2);
        assertEq(ausd.balanceOf(fan) - sellerBefore, PRICE - royalty);
        assertEq(firstrow.hostBalance(id), royalty);
        assertEq(firstrow.ticketCountOf(fan), 0);
        assertEq(firstrow.ticketCountOf(fan2), 1);
        assertEq(firstrow.doorKeyOf(id, fan2), dk);
        assertFalse(firstrow.isListed(t));
        assertEq(firstrow.listingsOf(id, 0, 10).length, 0);
    }

    function test_resale_capEnforced() public {
        vm.prank(host);
        uint256 id = firstrow.createEvent(_params(1000, 0), _tiers(PRICE, 10));
        uint256 t = _buy(fanKey, id, 1, address(0));

        vm.startPrank(fan);
        firstrow.list(t, PRICE * 11 / 10);
        vm.expectRevert(Firstrow.PriceAboveCap.selector);
        firstrow.list(t, PRICE * 11 / 10 + 1);
        vm.stopPrank();
    }

    function test_resale_defaultCapIsFaceValue() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(fan);
        vm.expectRevert(Firstrow.PriceAboveCap.selector);
        firstrow.list(t, PRICE + 1);
    }

    function test_resale_newOwnerChecksInAndOldOwnerCannot() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(fan);
        firstrow.list(t, PRICE);
        Firstrow.Authorization memory a = _auth(fan2Key, address(firstrow), PRICE);
        vm.prank(fan2);
        firstrow.buyResale(t, address(0), a);

        vm.warp(block.timestamp + START);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory oldSig = _checkInSig(fanKey, id, _ids(t), deadline);
        vm.prank(host);
        vm.expectRevert(Firstrow.InvalidSignature.selector);
        firstrow.checkIn(id, _ids(t), deadline, oldSig);

        _checkIn(fan2Key, id, _ids(t));
        assertEq(firstrow.supporter(host, fan2).shows, 1);
        assertEq(firstrow.supporter(host, fan).shows, 0);
    }

    function test_resale_cannotBuyOwnOrUnlisted() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        Firstrow.Authorization memory a = _auth(fan2Key, address(firstrow), PRICE);
        vm.prank(fan2);
        vm.expectRevert(Firstrow.NotListed.selector);
        firstrow.buyResale(t, address(0), a);

        vm.startPrank(fan);
        firstrow.list(t, PRICE);
        Firstrow.Authorization memory own = _auth(fanKey, address(firstrow), PRICE);
        vm.expectRevert(Firstrow.OwnTicket.selector);
        firstrow.buyResale(t, address(0), own);
        vm.stopPrank();
    }

    function test_resale_unlistAndRelist() public {
        uint256 id = _createEvent();
        uint256 first = _buy(fanKey, id, 2, address(0));
        vm.startPrank(fan);
        firstrow.list(first, PRICE);
        firstrow.list(first + 1, PRICE / 2);
        firstrow.unlist(first);
        vm.stopPrank();

        uint256[] memory listed = firstrow.listingsOf(id, 0, 10);
        assertEq(listed.length, 1);
        assertEq(listed[0], first + 1);
        assertEq(firstrow.listingPrice(first + 1), PRICE / 2);
    }

    function test_resale_listingDroppedOnCheckIn() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(fan);
        firstrow.list(t, PRICE);
        vm.warp(block.timestamp + START);
        _checkIn(fanKey, id, _ids(t));
        assertFalse(firstrow.isListed(t));
    }

    function test_resale_onlyOwnerCanList() public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        vm.prank(fan2);
        vm.expectRevert(Firstrow.NotOwner.selector);
        firstrow.list(t, PRICE);
    }

    // relayed through the forwarder

    function test_relayed_fullFlowWithoutFanGas() public {
        _relay(hostKey, abi.encodeCall(Firstrow.createEvent, (_params(0, 500), _tiers(PRICE, 100))));
        uint256 id = firstrow.eventCount();
        assertEq(_host(id), host);

        _relay(hostKey, abi.encodeCall(Firstrow.setDoor, (id, door, true)));

        (address dk, uint256 dkKey) = makeAddrAndKey("fan-door-key");
        Firstrow.Authorization memory a = _auth(fanKey, address(firstrow), PRICE);
        _relay(fanKey, abi.encodeCall(Firstrow.buy, (id, 0, 1, dk, a)));
        assertEq(firstrow.getTicket(1).owner, fan);

        vm.warp(block.timestamp + START);
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory sig = _checkInSig(dkKey, id, _ids(1), deadline);
        _relay(doorKey, abi.encodeCall(Firstrow.checkIn, (id, _ids(1), deadline, sig)));

        _relay(hostKey, abi.encodeCall(Firstrow.withdraw, (id, host)));
        assertEq(ausd.balanceOf(host), PRICE);
        assertEq(fan.balance, 0);
        assertEq(host.balance, 0);
    }

    function test_relayed_cannotActAsSomeoneElse() public {
        uint256 id = _createEvent();
        // The forwarder appends the signer, so a fan can't cancel the host's event through it.
        ERC2771Forwarder.ForwardRequestData memory req =
            _forwardRequest(fanKey, abi.encodeCall(Firstrow.cancelEvent, (id)));
        vm.prank(relayer);
        vm.expectRevert();
        forwarder.execute(req);
        (Firstrow.Event memory e,) = firstrow.getEvent(id);
        assertFalse(e.cancelled);
    }

    function _host(uint256 id) private view returns (address) {
        (Firstrow.Event memory e,) = firstrow.getEvent(id);
        return e.host;
    }

    // fuzz

    function testFuzz_resalePriceSplit(uint128 face, uint16 royaltyBps, uint16 capBps, uint256 price) public {
        face = uint128(bound(face, 0, 10_000e6));
        royaltyBps = uint16(bound(royaltyBps, 0, 2000));
        capBps = uint16(bound(capBps, 0, 5000));
        price = bound(price, 0, uint256(face) * (10_000 + capBps) / 10_000);

        vm.prank(host);
        uint256 id = firstrow.createEvent(_params(capBps, royaltyBps), _tiers(face, 10));
        ausd.mint(fan, face);
        ausd.mint(fan2, price);
        Firstrow.Authorization memory a = _auth(fanKey, address(firstrow), face);
        vm.prank(fan);
        uint256 t = firstrow.buy(id, 0, 1, address(0), a);
        vm.prank(fan);
        firstrow.list(t, price);

        uint256 fanBefore = ausd.balanceOf(fan);
        uint256 escrowBefore = ausd.balanceOf(address(firstrow));
        Firstrow.Authorization memory b = _auth(fan2Key, address(firstrow), price);
        vm.prank(fan2);
        firstrow.buyResale(t, address(0), b);

        uint256 royalty = price * royaltyBps / 10_000;
        assertEq(ausd.balanceOf(fan) - fanBefore, price - royalty);
        assertEq(ausd.balanceOf(address(firstrow)) - escrowBefore, royalty);
        assertEq(firstrow.hostBalance(id), royalty);
    }

    function testFuzz_buyQuantity(uint8 quantity, uint128 price) public {
        quantity = uint8(bound(quantity, 1, 10));
        price = uint128(bound(price, 0, 1_000e6));
        vm.prank(host);
        uint256 id = firstrow.createEvent(_params(0, 0), _tiers(price, 10));
        ausd.mint(fan, uint256(price) * quantity);
        Firstrow.Authorization memory a = _auth(fanKey, address(firstrow), uint256(price) * quantity);
        vm.prank(fan);
        firstrow.buy(id, 0, quantity, address(0), a);
        assertEq(ausd.balanceOf(address(firstrow)), uint256(price) * quantity);
        assertEq(firstrow.ticketCountOf(fan), quantity);
    }

    function testFuzz_refundWindow(uint256 after_) public {
        uint256 id = _createEvent();
        uint256 t = _buy(fanKey, id, 1, address(0));
        (Firstrow.Event memory e,) = firstrow.getEvent(id);
        after_ = bound(after_, block.timestamp, uint256(e.endsAt) + 30 days);
        vm.warp(after_);

        bool open = after_ > e.endsAt && after_ <= uint256(e.endsAt) + 7 days;
        vm.prank(fan);
        if (!open) vm.expectRevert(Firstrow.NotRefundable.selector);
        firstrow.refund(_ids(t), fan);
    }
}
