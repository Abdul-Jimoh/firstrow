// Resale and refunds through the UI: fan A buys and lists, fan B buys the listing, the host cancels,
// fan B refunds. Usage: pnpm dev --port 3200, then `node scripts/e2e-resale.mjs`.
import { chromium } from "playwright";
import { base, buy, createEvent, signUp, step, topUp, withPasskey } from "./helpers.mjs";

const browser = await chromium.launch();

const host = await withPasskey(browser, { width: 1440, height: 900 });
await signUp(host, "Resale Host");
const eventId = await createEvent(host, { name: `Resale Night ${new Date().toISOString().slice(11, 16)}` });
step(`event ${eventId} created (5% host cut, face-value cap)`);

const a = await withPasskey(browser);
await signUp(a, "Fan A");
await topUp(a);
await buy(a, eventId);
step("fan A bought for $5");

await a.goto(`${base}/tickets`);
await a.locator('a[href^="/tickets/"]').first().click();
await a.getByLabel(/Your price/).fill("9");
await a.getByRole("button", { name: "List for sale" }).click();
await a.getByText(/caps resale at \$5/).waitFor({ timeout: 30_000 });
step("listing above face value is refused");
await a.getByLabel(/Your price/).fill("5");
await a.getByRole("button", { name: "List for sale" }).click();
await a.getByText(/On sale for \$5/).waitFor({ timeout: 60_000 });
step("fan A listed at $5");

const b = await withPasskey(browser);
await signUp(b, "Fan B");
await topUp(b);
await b.goto(`${base}/events/${eventId}`);
await b.getByRole("button", { name: /^Buy · \$5/ }).click();
await b.getByText("You're in.").waitFor({ timeout: 60_000 });
step("fan B bought the listing");

await a.goto(`${base}/tickets`);
await a.getByText("$99.75", { exact: true }).waitFor({ timeout: 30_000 });
await a.getByText("No tickets yet.").waitFor();
step("fan A was paid $4.75 ($5 minus the host's 5%) and no longer holds the ticket");

await host.goto(`${base}/host/${eventId}`);
await host.getByText("$0.25").first().waitFor({ timeout: 30_000 });
step("host can withdraw the $0.25 royalty");

await host.getByRole("button", { name: "Cancel event" }).click();
await host.getByRole("button", { name: /Yes, cancel the event/ }).click();
await host.getByText(/cancelled/i).first().waitFor({ timeout: 60_000 });
step("host cancelled the event");

await b.goto(`${base}/tickets`);
await b.locator('a[href^="/tickets/"]').first().click();
await b.getByRole("button", { name: /Claim refund · \$5/ }).click();
await b.getByText("Refunded.").waitFor({ timeout: 60_000 });
await b.goto(`${base}/tickets`);
await b.getByText("$100", { exact: true }).waitFor({ timeout: 30_000 });
step("fan B refunded themselves: balance back to $100");

console.log(`\nAll good. Event ${eventId}.`);
await browser.close();
