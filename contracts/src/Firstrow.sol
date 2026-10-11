// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title Firstrow
/// @notice Event tickets paid in AUSD and held in escrow until the holder is checked in at the door.
/// Check-ins build a per-host attendance record that gates presales for a host's returning fans.
/// Every state-changing call can be relayed through the trusted ERC-2771 forwarder.
contract Firstrow is ERC2771Context, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC3009;

    enum Status {
        None,
        Valid,
        CheckedIn,
        Refunded
    }

    struct Event {
        address host;
        uint64 startsAt;
        uint64 endsAt;
        uint64 saleStartsAt;
        uint64 presaleStartsAt;
        uint16 presaleMinShows;
        uint16 resaleCapBps;
        uint16 royaltyBps;
        uint8 tierCount;
        bool cancelled;
        uint32 sold;
        uint32 checkedIn;
        uint128 validValue;
        uint128 checkedInValue;
        uint128 royalties;
        uint128 paidOut;
        string metadataURI;
    }

    struct Tier {
        uint128 price;
        uint32 supply;
        uint32 sold;
    }

    struct Ticket {
        uint64 eventId;
        uint8 tier;
        Status status;
        address owner;
    }

    struct EventParams {
        string metadataURI;
        uint64 startsAt;
        uint64 endsAt;
        uint64 saleStartsAt;
        uint64 presaleStartsAt;
        uint16 presaleMinShows;
        uint16 resaleCapBps;
        uint16 royaltyBps;
    }

    struct TierParams {
        uint128 price;
        uint32 supply;
    }

    /// @dev An EIP-3009 `receiveWithAuthorization` signature from the payer to this contract.
    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Supporter {
        uint32 shows;
        uint32 number;
    }

    uint256 public constant MAX_TIERS = 10;
    uint256 public constant MAX_PER_ORDER = 10;
    uint256 public constant MAX_DURATION = 30 days;
    uint256 public constant CLAIM_WINDOW = 7 days;
    uint256 public constant CHECK_IN_OPENS = 6 hours;
    uint256 public constant SIGNATURE_WINDOW = 10 minutes;
    uint16 public constant MAX_ROYALTY_BPS = 2000;
    uint16 public constant MAX_RESALE_CAP_BPS = 5000;

    bytes32 private constant CHECK_IN_TYPEHASH =
        keccak256("CheckIn(uint256 eventId,uint256[] ticketIds,uint256 deadline)");

    IERC3009 public immutable ausd;

    uint256 public eventCount;
    uint256 public ticketCount;

    mapping(uint256 eventId => Event) private _events;
    mapping(uint256 eventId => mapping(uint256 tier => Tier)) private _tiers;
    mapping(uint256 ticketId => Ticket) private _tickets;

    mapping(address owner => uint256[]) private _ticketsOf;
    mapping(uint256 ticketId => uint256) private _ticketIndex;

    mapping(uint256 ticketId => uint256) public listingPrice;
    mapping(uint256 ticketId => bool) public isListed;
    mapping(uint256 eventId => uint256[]) private _listings;
    mapping(uint256 ticketId => uint256) private _listingIndex;

    mapping(uint256 eventId => mapping(address => bool)) public isDoor;
    mapping(uint256 eventId => mapping(address fan => address)) public doorKeyOf;
    mapping(uint256 eventId => mapping(address fan => bool)) public attended;

    mapping(address host => mapping(address fan => Supporter)) private _supporters;
    mapping(address host => uint32) public supporterCount;

    event EventCreated(uint256 indexed eventId, address indexed host, string metadataURI);
    event EventUpdated(uint256 indexed eventId, string metadataURI);
    event EventCancelled(uint256 indexed eventId);
    event DoorSet(uint256 indexed eventId, address indexed door, bool allowed);
    event DoorKeySet(uint256 indexed eventId, address indexed fan, address key);
    event TicketsPurchased(
        uint256 indexed eventId,
        address indexed buyer,
        uint256 tier,
        uint256 firstTicketId,
        uint256 quantity,
        uint256 paid
    );
    event CheckedIn(uint256 indexed eventId, uint256 indexed ticketId, address indexed fan);
    event SupporterRecorded(address indexed host, address indexed fan, uint256 shows, uint256 number);
    event Refunded(uint256 indexed eventId, uint256 indexed ticketId, address indexed owner, uint256 amount);
    event Listed(uint256 indexed eventId, uint256 indexed ticketId, uint256 price);
    event Unlisted(uint256 indexed eventId, uint256 indexed ticketId);
    event Resold(
        uint256 indexed eventId,
        uint256 indexed ticketId,
        address indexed buyer,
        address seller,
        uint256 price,
        uint256 royalty
    );
    event HostWithdrawn(uint256 indexed eventId, address indexed to, uint256 amount);

    error InvalidSchedule();
    error InvalidTiers();
    error InvalidFees();
    error UnknownEvent();
    error UnknownTier();
    error NotHost();
    error NotDoor();
    error NotOwner();
    error EventIsCancelled();
    error SaleNotOpen();
    error SaleClosed();
    error PresaleLocked();
    error InvalidQuantity();
    error SoldOut();
    error CheckInClosed();
    error SignatureExpired();
    error SignatureTooEarly();
    error InvalidSignature();
    error MixedOwners();
    error TicketNotValid();
    error WrongEvent();
    error NotRefundable();
    error PriceAboveCap();
    error NotListed();
    error OwnTicket();
    error NothingToWithdraw();
    error ZeroAddress();

    constructor(IERC3009 ausd_, address forwarder) ERC2771Context(forwarder) EIP712("Firstrow", "1") {
        ausd = ausd_;
    }

    function createEvent(EventParams calldata p, TierParams[] calldata tiers) external returns (uint256 eventId) {
        if (
            p.startsAt <= block.timestamp || p.endsAt <= p.startsAt || p.endsAt - p.startsAt > MAX_DURATION
                || p.saleStartsAt >= p.endsAt || p.presaleStartsAt > p.saleStartsAt
        ) revert InvalidSchedule();
        if (tiers.length == 0 || tiers.length > MAX_TIERS) revert InvalidTiers();
        if (p.royaltyBps > MAX_ROYALTY_BPS || p.resaleCapBps > MAX_RESALE_CAP_BPS) revert InvalidFees();

        eventId = ++eventCount;
        Event storage e = _events[eventId];
        e.host = _msgSender();
        e.startsAt = p.startsAt;
        e.endsAt = p.endsAt;
        e.saleStartsAt = p.saleStartsAt;
        // Without a show requirement there is no presale, so it opens with the public sale.
        e.presaleStartsAt = p.presaleMinShows == 0 ? p.saleStartsAt : p.presaleStartsAt;
        e.presaleMinShows = p.presaleMinShows;
        e.resaleCapBps = p.resaleCapBps;
        e.royaltyBps = p.royaltyBps;
        e.tierCount = uint8(tiers.length);
        e.metadataURI = p.metadataURI;

        for (uint256 i; i < tiers.length; ++i) {
            if (tiers[i].supply == 0) revert InvalidTiers();
            _tiers[eventId][i] = Tier({price: tiers[i].price, supply: tiers[i].supply, sold: 0});
        }

        emit EventCreated(eventId, e.host, p.metadataURI);
    }

    /// @notice Change the event's description, poster and other display details. The schedule, prices and
    /// resale rules can't be changed.
    function updateMetadata(uint256 eventId, string calldata metadataURI) external {
        Event storage e = _onlyHost(eventId);
        if (block.timestamp >= e.endsAt) revert SaleClosed();
        e.metadataURI = metadataURI;
        emit EventUpdated(eventId, metadataURI);
    }

    function setDoor(uint256 eventId, address door, bool allowed) external {
        _onlyHost(eventId);
        if (door == address(0)) revert ZeroAddress();
        isDoor[eventId][door] = allowed;
        emit DoorSet(eventId, door, allowed);
    }

    function cancelEvent(uint256 eventId) external {
        Event storage e = _onlyHost(eventId);
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp >= e.endsAt) revert SaleClosed();
        e.cancelled = true;
        emit EventCancelled(eventId);
    }

    function withdraw(uint256 eventId, address to) external nonReentrant {
        Event storage e = _onlyHost(eventId);
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = hostBalance(eventId);
        if (amount == 0) revert NothingToWithdraw();
        e.paidOut += uint128(amount);
        ausd.safeTransfer(to, amount);
        emit HostWithdrawn(eventId, to, amount);
    }

    /// @notice Buy `quantity` tickets of one tier. The price is pulled with the buyer's EIP-3009 authorization.
    /// @param doorKey Optional key that may sign this buyer's check-ins for the event (zero leaves it unchanged).
    function buy(uint256 eventId, uint256 tier, uint256 quantity, address doorKey, Authorization calldata auth)
        external
        nonReentrant
        returns (uint256 firstTicketId)
    {
        Event storage e = _existing(eventId);
        if (e.cancelled) revert EventIsCancelled();
        if (tier >= e.tierCount) revert UnknownTier();
        if (quantity == 0 || quantity > MAX_PER_ORDER) revert InvalidQuantity();
        if (block.timestamp >= e.endsAt) revert SaleClosed();

        address buyer = _msgSender();
        if (block.timestamp < e.saleStartsAt) {
            if (block.timestamp < e.presaleStartsAt) revert SaleNotOpen();
            if (_supporters[e.host][buyer].shows < e.presaleMinShows) revert PresaleLocked();
        }

        Tier storage t = _tiers[eventId][tier];
        if (t.sold + quantity > t.supply) revert SoldOut();
        uint256 total = uint256(t.price) * quantity;

        t.sold += uint32(quantity);
        e.sold += uint32(quantity);
        e.validValue += uint128(total);

        firstTicketId = ticketCount + 1;
        ticketCount += quantity;
        for (uint256 i; i < quantity; ++i) {
            uint256 id = firstTicketId + i;
            _tickets[id] = Ticket({eventId: uint64(eventId), tier: uint8(tier), status: Status.Valid, owner: buyer});
            _addTicket(buyer, id);
        }
        if (doorKey != address(0)) _setDoorKey(eventId, buyer, doorKey);

        if (total > 0) _pull(buyer, total, auth);
        emit TicketsPurchased(eventId, buyer, tier, firstTicketId, quantity, total);
    }

    function setDoorKey(uint256 eventId, address key) external {
        _existing(eventId);
        _setDoorKey(eventId, _msgSender(), key);
    }

    /// @notice Refund unscanned tickets: any time after a cancellation, or within the claim window after the event.
    function refund(uint256[] calldata ticketIds, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        address owner = _msgSender();
        uint256 total;
        for (uint256 i; i < ticketIds.length; ++i) {
            uint256 id = ticketIds[i];
            Ticket storage tk = _tickets[id];
            if (tk.owner != owner) revert NotOwner();
            if (tk.status != Status.Valid) revert TicketNotValid();
            Event storage e = _events[tk.eventId];
            bool open =
                e.cancelled || (block.timestamp > e.endsAt && block.timestamp <= uint256(e.endsAt) + CLAIM_WINDOW);
            if (!open) revert NotRefundable();

            uint128 price = _tiers[tk.eventId][tk.tier].price;
            tk.status = Status.Refunded;
            e.validValue -= price;
            if (isListed[id]) _unlist(tk.eventId, id);
            total += price;
            emit Refunded(tk.eventId, id, owner, price);
        }
        if (total > 0) ausd.safeTransfer(to, total);
    }

    function list(uint256 ticketId, uint256 price) external {
        Ticket storage tk = _ownedValid(ticketId);
        Event storage e = _events[tk.eventId];
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp >= e.endsAt) revert SaleClosed();
        uint256 face = _tiers[tk.eventId][tk.tier].price;
        if (price > face * (10_000 + e.resaleCapBps) / 10_000) revert PriceAboveCap();

        if (!isListed[ticketId]) {
            isListed[ticketId] = true;
            _listingIndex[ticketId] = _listings[tk.eventId].length;
            _listings[tk.eventId].push(ticketId);
        }
        listingPrice[ticketId] = price;
        emit Listed(tk.eventId, ticketId, price);
    }

    function unlist(uint256 ticketId) external {
        Ticket storage tk = _ownedValid(ticketId);
        if (!isListed[ticketId]) revert NotListed();
        _unlist(tk.eventId, ticketId);
    }

    /// @notice Buy a listed ticket. The host's royalty stays in the contract; the rest goes to the seller.
    function buyResale(uint256 ticketId, address doorKey, Authorization calldata auth) external nonReentrant {
        Ticket storage tk = _tickets[ticketId];
        if (!isListed[ticketId]) revert NotListed();
        uint256 eventId = tk.eventId;
        Event storage e = _events[eventId];
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp >= e.endsAt) revert SaleClosed();

        address buyer = _msgSender();
        address seller = tk.owner;
        if (buyer == seller) revert OwnTicket();

        uint256 price = listingPrice[ticketId];
        uint256 royalty = price * e.royaltyBps / 10_000;

        _unlist(eventId, ticketId);
        _removeTicket(seller, ticketId);
        _addTicket(buyer, ticketId);
        tk.owner = buyer;
        e.royalties += uint128(royalty);
        if (doorKey != address(0)) _setDoorKey(eventId, buyer, doorKey);

        if (price > 0) {
            _pull(buyer, price, auth);
            if (price > royalty) ausd.safeTransfer(seller, price - royalty);
        }
        emit Resold(eventId, ticketId, buyer, seller, price, royalty);
    }

    /// @notice Check in tickets owned by one fan. Called by the host or a paired door device with the fan's
    /// signature, made by the fan's account or by the door key they registered for this event.
    function checkIn(uint256 eventId, uint256[] calldata ticketIds, uint256 deadline, bytes calldata signature)
        external
    {
        Event storage e = _existing(eventId);
        address sender = _msgSender();
        if (sender != e.host && !isDoor[eventId][sender]) revert NotDoor();
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp + CHECK_IN_OPENS < e.startsAt || block.timestamp > e.endsAt) revert CheckInClosed();
        if (block.timestamp > deadline) revert SignatureExpired();
        // A signature can't be collected far ahead of time and used later.
        if (deadline > block.timestamp + SIGNATURE_WINDOW) revert SignatureTooEarly();
        if (ticketIds.length == 0) revert InvalidQuantity();

        address fan = _tickets[ticketIds[0]].owner;
        if (!_signedByFan(eventId, fan, _checkInDigest(eventId, ticketIds, deadline), signature)) {
            revert InvalidSignature();
        }

        uint128 value = _markCheckedIn(eventId, ticketIds, fan);
        e.validValue -= value;
        e.checkedInValue += value;
        e.checkedIn += uint32(ticketIds.length);

        if (!attended[eventId][fan]) {
            attended[eventId][fan] = true;
            Supporter storage s = _supporters[e.host][fan];
            if (s.shows == 0) s.number = ++supporterCount[e.host];
            s.shows += 1;
            emit SupporterRecorded(e.host, fan, s.shows, s.number);
        }
    }

    /// @notice What the host can withdraw now: checked-in ticket value, resale royalties and, once the claim
    /// window has passed without a cancellation, the value of tickets nobody refunded.
    function hostBalance(uint256 eventId) public view returns (uint256) {
        Event storage e = _events[eventId];
        uint256 earned = uint256(e.checkedInValue) + e.royalties;
        if (!e.cancelled && block.timestamp > uint256(e.endsAt) + CLAIM_WINDOW) earned += e.validValue;
        return earned - e.paidOut;
    }

    function getEvent(uint256 eventId) external view returns (Event memory e, Tier[] memory tiers) {
        e = _events[eventId];
        tiers = new Tier[](e.tierCount);
        for (uint256 i; i < tiers.length; ++i) {
            tiers[i] = _tiers[eventId][i];
        }
    }

    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        return _tickets[ticketId];
    }

    function supporter(address host, address fan) external view returns (Supporter memory) {
        return _supporters[host][fan];
    }

    function ticketsOf(address owner, uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        return _page(_ticketsOf[owner], offset, limit);
    }

    function ticketCountOf(address owner) external view returns (uint256) {
        return _ticketsOf[owner].length;
    }

    function listingsOf(uint256 eventId, uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        return _page(_listings[eventId], offset, limit);
    }

    function checkInDigest(uint256 eventId, uint256[] calldata ticketIds, uint256 deadline)
        external
        view
        returns (bytes32)
    {
        return _checkInDigest(eventId, ticketIds, deadline);
    }

    function _existing(uint256 eventId) private view returns (Event storage e) {
        e = _events[eventId];
        if (e.host == address(0)) revert UnknownEvent();
    }

    function _onlyHost(uint256 eventId) private view returns (Event storage e) {
        e = _existing(eventId);
        if (_msgSender() != e.host) revert NotHost();
    }

    function _ownedValid(uint256 ticketId) private view returns (Ticket storage tk) {
        tk = _tickets[ticketId];
        if (tk.owner != _msgSender()) revert NotOwner();
        if (tk.status != Status.Valid) revert TicketNotValid();
    }

    function _checkInDigest(uint256 eventId, uint256[] calldata ticketIds, uint256 deadline)
        private
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(abi.encode(CHECK_IN_TYPEHASH, eventId, keccak256(abi.encodePacked(ticketIds)), deadline))
        );
    }

    function _signedByFan(uint256 eventId, address fan, bytes32 digest, bytes calldata signature)
        private
        view
        returns (bool)
    {
        address key = doorKeyOf[eventId][fan];
        if (key != address(0) && SignatureChecker.isValidSignatureNow(key, digest, signature)) return true;
        return SignatureChecker.isValidSignatureNow(fan, digest, signature);
    }

    function _markCheckedIn(uint256 eventId, uint256[] calldata ticketIds, address fan)
        private
        returns (uint128 value)
    {
        for (uint256 i; i < ticketIds.length; ++i) {
            uint256 id = ticketIds[i];
            Ticket storage tk = _tickets[id];
            if (tk.eventId != eventId) revert WrongEvent();
            if (tk.owner != fan) revert MixedOwners();
            if (tk.status != Status.Valid) revert TicketNotValid();
            tk.status = Status.CheckedIn;
            if (isListed[id]) _unlist(eventId, id);
            value += _tiers[eventId][tk.tier].price;
            emit CheckedIn(eventId, id, fan);
        }
    }

    function _pull(address from, uint256 amount, Authorization calldata a) private {
        ausd.receiveWithAuthorization(from, address(this), amount, a.validAfter, a.validBefore, a.nonce, a.v, a.r, a.s);
    }

    function _setDoorKey(uint256 eventId, address fan, address key) private {
        doorKeyOf[eventId][fan] = key;
        emit DoorKeySet(eventId, fan, key);
    }

    function _unlist(uint256 eventId, uint256 ticketId) private {
        uint256[] storage arr = _listings[eventId];
        uint256 idx = _listingIndex[ticketId];
        uint256 last = arr[arr.length - 1];
        arr[idx] = last;
        _listingIndex[last] = idx;
        arr.pop();
        delete _listingIndex[ticketId];
        delete isListed[ticketId];
        delete listingPrice[ticketId];
        emit Unlisted(eventId, ticketId);
    }

    function _addTicket(address owner, uint256 id) private {
        _ticketIndex[id] = _ticketsOf[owner].length;
        _ticketsOf[owner].push(id);
    }

    function _removeTicket(address owner, uint256 id) private {
        uint256[] storage arr = _ticketsOf[owner];
        uint256 idx = _ticketIndex[id];
        uint256 last = arr[arr.length - 1];
        arr[idx] = last;
        _ticketIndex[last] = idx;
        arr.pop();
    }

    function _page(uint256[] storage arr, uint256 offset, uint256 limit) private view returns (uint256[] memory out) {
        if (offset >= arr.length) return out;
        uint256 end = offset + limit > arr.length ? arr.length : offset + limit;
        out = new uint256[](end - offset);
        for (uint256 i; i < out.length; ++i) {
            out[i] = arr[offset + i];
        }
    }
}
