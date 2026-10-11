import { indexer, type Host, type Totals } from "envio";

const TOTALS = "totals";

const emptyTotals: Totals = {
  id: TOTALS,
  events: 0,
  ticketsSold: 0,
  checkIns: 0,
  supporters: 0,
  primaryVolume: 0n,
  resaleVolume: 0n,
  royalties: 0n,
  refunded: 0n,
};

const emptyHost = (id: string): Host => ({ id, events: 0, ticketsSold: 0, checkIns: 0, supporters: 0 });

const lower = (address: string) => address.toLowerCase();

indexer.onEvent({ contract: "Firstrow", event: "EventCreated" }, async ({ event, context }) => {
  const hostId = lower(event.params.host);
  const [totals, host] = await Promise.all([context.Totals.get(TOTALS), context.Host.get(hostId)]);

  context.Event.set({
    id: event.params.eventId.toString(),
    host: hostId,
    metadataURI: event.params.metadataURI,
    cancelled: false,
    ticketsSold: 0,
    checkIns: 0,
    createdAt: event.block.timestamp,
  });
  const h = host ?? emptyHost(hostId);
  context.Host.set({ ...h, events: h.events + 1 });
  const t = totals ?? emptyTotals;
  context.Totals.set({ ...t, events: t.events + 1 });
});

indexer.onEvent({ contract: "Firstrow", event: "EventUpdated" }, async ({ event, context }) => {
  const e = await context.Event.get(event.params.eventId.toString());
  if (e) context.Event.set({ ...e, metadataURI: event.params.metadataURI });
});

indexer.onEvent({ contract: "Firstrow", event: "EventCancelled" }, async ({ event, context }) => {
  const e = await context.Event.get(event.params.eventId.toString());
  if (e) context.Event.set({ ...e, cancelled: true });
});

indexer.onEvent({ contract: "Firstrow", event: "TicketsPurchased" }, async ({ event, context }) => {
  const quantity = Number(event.params.quantity);
  const e = await context.Event.get(event.params.eventId.toString());
  if (!e) return;
  const [totals, host] = await Promise.all([context.Totals.get(TOTALS), context.Host.get(e.host)]);

  context.Event.set({ ...e, ticketsSold: e.ticketsSold + quantity });
  const h = host ?? emptyHost(e.host);
  context.Host.set({ ...h, ticketsSold: h.ticketsSold + quantity });
  const t = totals ?? emptyTotals;
  context.Totals.set({ ...t, ticketsSold: t.ticketsSold + quantity, primaryVolume: t.primaryVolume + event.params.paid });
});

indexer.onEvent({ contract: "Firstrow", event: "CheckedIn" }, async ({ event, context }) => {
  const e = await context.Event.get(event.params.eventId.toString());
  if (!e) return;
  const [totals, host] = await Promise.all([context.Totals.get(TOTALS), context.Host.get(e.host)]);

  context.CheckIn.set({
    id: event.params.ticketId.toString(),
    eventId: event.params.eventId,
    ticketId: event.params.ticketId,
    host: e.host,
    fan: lower(event.params.fan),
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
  context.Event.set({ ...e, checkIns: e.checkIns + 1 });
  const h = host ?? emptyHost(e.host);
  context.Host.set({ ...h, checkIns: h.checkIns + 1 });
  const t = totals ?? emptyTotals;
  context.Totals.set({ ...t, checkIns: t.checkIns + 1 });
});

// Emitted once per fan per event, after their tickets are checked in.
indexer.onEvent({ contract: "Firstrow", event: "SupporterRecorded" }, async ({ event, context }) => {
  const hostId = lower(event.params.host);
  const fanId = lower(event.params.fan);
  const id = `${hostId}-${fanId}`;
  const shows = Number(event.params.shows);
  const now = event.block.timestamp;
  const [existing, fan, host, totals] = await Promise.all([
    context.Supporter.get(id),
    context.Fan.get(fanId),
    context.Host.get(hostId),
    context.Totals.get(TOTALS),
  ]);

  context.Supporter.set({
    id,
    host: hostId,
    fan: fanId,
    number: Number(event.params.number),
    shows,
    firstShowAt: existing?.firstShowAt ?? now,
    lastShowAt: now,
  });
  context.Fan.set({
    id: fanId,
    shows: (fan?.shows ?? 0) + 1,
    hosts: (fan?.hosts ?? 0) + (existing ? 0 : 1),
    firstShowAt: fan?.firstShowAt ?? now,
    lastShowAt: now,
  });
  if (!existing) {
    const h = host ?? emptyHost(hostId);
    context.Host.set({ ...h, supporters: h.supporters + 1 });
    const t = totals ?? emptyTotals;
    context.Totals.set({ ...t, supporters: t.supporters + 1 });
  }
});

indexer.onEvent({ contract: "Firstrow", event: "Refunded" }, async ({ event, context }) => {
  const t = (await context.Totals.get(TOTALS)) ?? emptyTotals;
  context.Totals.set({ ...t, refunded: t.refunded + event.params.amount });
});

indexer.onEvent({ contract: "Firstrow", event: "Resold" }, async ({ event, context }) => {
  context.Resale.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    eventId: event.params.eventId,
    ticketId: event.params.ticketId,
    seller: lower(event.params.seller),
    buyer: lower(event.params.buyer),
    price: event.params.price,
    royalty: event.params.royalty,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
  const t = (await context.Totals.get(TOTALS)) ?? emptyTotals;
  context.Totals.set({ ...t, resaleVolume: t.resaleVolume + event.params.price, royalties: t.royalties + event.params.royalty });
});
