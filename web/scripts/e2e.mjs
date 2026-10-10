// Runs the passkey + relay flow against the configured chain using Chrome's virtual authenticator with PRF.
// Usage: pnpm dev (port 3200), then `node scripts/e2e.mjs`.
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3200";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    ctap2Version: "ctap2_1",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    hasPrf: true,
    automaticPresenceSimulation: true,
  },
});

page.on("console", (m) => m.type() === "error" && console.log("  [browser]", m.text()));
await page.goto(`${base}/lab`);
await page.waitForFunction(() => window.lab);

const step = async (name, fn, ...args) => {
  const started = Date.now();
  const result = await page.evaluate(([fn, args]) => window.lab[fn](...args), [fn, args]);
  console.log(`✓ ${name} (${Date.now() - started}ms)`, JSON.stringify(result));
  return result;
};

const address = await step("sign up with passkey", "signUp", "e2e fan");
await step("testnet AUSD from faucet", "faucet");
console.log("  AUSD balance", await step("balance", "ausdBalance", address));

const { eventId } = await step("create event (relayed)", "createEvent", "5000000");
const { ticketId, doorKey } = await step("buy ticket with door key (relayed, EIP-3009)", "buy", eventId, "5000000");

// A fresh page has no session: signing in again must give the same account.
await page.reload();
await page.waitForFunction(() => window.lab);
const again = await step("sign in again", "signIn");
if (again !== address) throw new Error(`address changed: ${again} != ${address}`);

const { status } = await step("check in with door key (relayed)", "checkIn", eventId, ticketId);
if (status !== 2) throw new Error(`ticket status ${status}, expected CheckedIn (2)`);

console.log(`\nAll good. fan ${address}, event ${eventId}, ticket ${ticketId}, door key ${doorKey}`);
await browser.close();
