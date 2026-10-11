import { describe, expect, it } from "vitest";
import { createTestIndexer } from "envio";

const CHAIN = 10143;
const host = "0x00000000000000000000000000000000000000A1";
const ada = "0x00000000000000000000000000000000000000B1";
const bayo = "0x00000000000000000000000000000000000000B2";
const lower = (a: string) => a.toLowerCase();

describe("Firstrow indexer", () => {
  it("builds attendance and supporter records from a night's events", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            { contract: "Firstrow", event: "EventCreated", params: { eventId: 1n, host, metadataURI: "data:x" } },
            {
              contract: "Firstrow",
              event: "TicketsPurchased",
              params: { eventId: 1n, buyer: ada, tier: 0n, firstTicketId: 1n, quantity: 2n, paid: 10_000_000n },
            },
            {
              contract: "Firstrow",
              event: "TicketsPurchased",
              params: { eventId: 1n, buyer: bayo, tier: 0n, firstTicketId: 3n, quantity: 1n, paid: 5_000_000n },
            },
            { contract: "Firstrow", event: "CheckedIn", params: { eventId: 1n, ticketId: 3n, fan: bayo } },
            { contract: "Firstrow", event: "SupporterRecorded", params: { host, fan: bayo, shows: 1n, number: 1n } },
            { contract: "Firstrow", event: "CheckedIn", params: { eventId: 1n, ticketId: 1n, fan: ada } },
            { contract: "Firstrow", event: "CheckedIn", params: { eventId: 1n, ticketId: 2n, fan: ada } },
            { contract: "Firstrow", event: "SupporterRecorded", params: { host, fan: ada, shows: 1n, number: 2n } },
          ],
        },
      },
    });

    const totals = await indexer.Totals.getOrThrow("totals");
    expect(totals).toMatchObject({ events: 1, ticketsSold: 3, checkIns: 3, supporters: 2, primaryVolume: 15_000_000n });

    expect(await indexer.Event.getOrThrow("1")).toMatchObject({ host: lower(host), ticketsSold: 3, checkIns: 3 });
    expect(await indexer.Host.getOrThrow(lower(host))).toMatchObject({ events: 1, checkIns: 3, supporters: 2 });

    // Bayo was scanned first, so he is supporter No. 1 even though Ada bought first.
    expect(await indexer.Supporter.getOrThrow(`${lower(host)}-${lower(bayo)}`)).toMatchObject({ number: 1, shows: 1 });
    expect(await indexer.Supporter.getOrThrow(`${lower(host)}-${lower(ada)}`)).toMatchObject({ number: 2, shows: 1 });

    // Ada brought a friend on her second ticket: two check-ins, one show.
    expect(await indexer.Fan.getOrThrow(lower(ada))).toMatchObject({ shows: 1, hosts: 1 });
    expect(await indexer.CheckIn.getOrThrow("2")).toMatchObject({ fan: lower(ada), host: lower(host) });
  });

  it("counts a returning fan's second show without a new supporter number", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            { contract: "Firstrow", event: "EventCreated", params: { eventId: 1n, host, metadataURI: "" } },
            { contract: "Firstrow", event: "SupporterRecorded", params: { host, fan: ada, shows: 1n, number: 1n } },
            { contract: "Firstrow", event: "EventCreated", params: { eventId: 2n, host, metadataURI: "" } },
            { contract: "Firstrow", event: "SupporterRecorded", params: { host, fan: ada, shows: 2n, number: 1n } },
          ],
        },
      },
    });

    expect(await indexer.Supporter.getOrThrow(`${lower(host)}-${lower(ada)}`)).toMatchObject({ number: 1, shows: 2 });
    expect(await indexer.Fan.getOrThrow(lower(ada))).toMatchObject({ shows: 2, hosts: 1 });
    expect(await indexer.Host.getOrThrow(lower(host))).toMatchObject({ events: 2, supporters: 1 });
  });

  it("tracks resales, royalties, refunds and cancellations", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            { contract: "Firstrow", event: "EventCreated", params: { eventId: 1n, host, metadataURI: "" } },
            {
              contract: "Firstrow",
              event: "Resold",
              params: { eventId: 1n, ticketId: 1n, buyer: bayo, seller: ada, price: 5_000_000n, royalty: 250_000n },
            },
            { contract: "Firstrow", event: "EventCancelled", params: { eventId: 1n } },
            { contract: "Firstrow", event: "Refunded", params: { eventId: 1n, ticketId: 1n, owner: bayo, amount: 5_000_000n } },
          ],
        },
      },
    });

    expect(await indexer.Totals.getOrThrow("totals")).toMatchObject({
      resaleVolume: 5_000_000n,
      royalties: 250_000n,
      refunded: 5_000_000n,
    });
    expect(await indexer.Event.getOrThrow("1")).toMatchObject({ cancelled: true });
  });
});
