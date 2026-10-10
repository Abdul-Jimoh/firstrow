// Full UI run on the configured chain: a host creates an event and pairs a door phone, a fan buys and opens
// their entry code, and a door phone scans it through a fake camera fed with the QR.
// Usage: pnpm dev --port 3200, then `node scripts/e2e-ui.mjs [screenshotDir]`.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import QRCode from "qrcode";

const base = process.env.BASE_URL ?? "http://localhost:3200";
const shots = process.argv[2];
const work = mkdtempSync(join(tmpdir(), "firstrow-e2e-"));
const pad = (n) => String(n).padStart(2, "0");

async function withPasskey(browser, viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
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
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  return page;
}

let n = 0;
async function shot(page, name) {
  if (!shots) return;
  await page.screenshot({ path: `${shots}/${pad(++n)}-${name}.png`, fullPage: true });
}

async function signUp(page, name) {
  await page.goto(`${base}/tickets`);
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByLabel("Name on your tickets").fill(name);
  await page.getByRole("button", { name: /Create my pass/ }).click();
  await page.getByText("Signed in as").waitFor();
}

const step = (label) => console.log(`✓ ${label}`);
const browser = await chromium.launch();

// Host
const host = await withPasskey(browser, { width: 1440, height: 900 });
await signUp(host, "E2E Host");
step("host signed up");

const start = new Date(Date.now() + 30 * 60_000);
const end = new Date(start.getTime() + 3 * 3600_000);
await host.goto(`${base}/host/new`);
await host.getByLabel("Name").fill(`E2E Night ${start.toISOString().slice(11, 16)}`);
await host.getByLabel("Venue").fill("Test Hall");
await host.getByLabel("City").fill("Lagos");
await host.getByLabel("Date").first().fill(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
await host.getByLabel("Doors open").fill(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
await host.getByLabel(/^Ends/).fill(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
await host.locator("input[inputmode=decimal]").first().fill("5");
await shot(host, "host-new");
await host.getByRole("button", { name: /Publish event/ }).click();
await host.waitForURL(/\/host\/\d+$/, { timeout: 60_000 });
const eventId = host.url().split("/").pop();
step(`event ${eventId} created`);

await host.getByRole("button", { name: /Pair a door phone/ }).click();
const doorLink = await host.locator("[data-value]").getAttribute("data-value", { timeout: 60_000 });
await shot(host, "host-manage");
step("door phone paired");

// Fan
const fan = await withPasskey(browser, { width: 390, height: 844 });
await signUp(fan, "E2E Fan");
await fan.getByRole("button", { name: "+ Add test dollars" }).click();
await fan.getByText(/Balance \$100/).waitFor({ timeout: 60_000 });
step("fan signed up and topped up");

await fan.goto(`${base}/events/${eventId}`);
await shot(fan, "event");
await fan.getByRole("button", { name: /Buy 1/ }).click();
await fan.getByText("You're in.").waitFor({ timeout: 60_000 });
step("fan bought a ticket");

await fan.goto(`${base}/tickets`);
await fan.locator('a[href^="/tickets/"]').first().click();
await fan.getByRole("button", { name: /Show entry code/ }).click();
const code = await fan.locator("[data-value]").getAttribute("data-value", { timeout: 30_000 });
await shot(fan, "ticket-code");
step("entry code shown");

// Door: feed the QR to a fake camera.
const png = join(work, "code.png");
const y4m = join(work, "code.y4m");
await QRCode.toFile(png, code, { width: 480, margin: 4 });
execFileSync("ffmpeg", ["-loglevel", "error", "-loop", "1", "-i", png, "-t", "3", "-vf", "pad=640:480:80:0:white", "-pix_fmt", "yuv420p", y4m]);
const doorBrowser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`],
});
const doorContext = await doorBrowser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] });
const door = await doorContext.newPage();
door.on("pageerror", (e) => console.log("  [door pageerror]", e.message));
door.on("console", (m) => m.type() === "error" && console.log("  [door]", m.text().slice(0, 200)));
await door.goto(doorLink);
try {
  await door.getByText(/Admit 1/).waitFor({ timeout: 45_000 });
} catch (e) {
  await door.screenshot({ path: `${shots ?? work}/door-failed.png` });
  throw e;
}
await shot(door, "door-admit");
step("door scanned and admitted");

await fan.getByText("Welcome").waitFor({ timeout: 30_000 });
await shot(fan, "ticket-welcome");
step("fan sees welcome");

await host.reload();
await host.getByText("Yours to withdraw").waitFor();
await shot(host, "host-after");
console.log(`\nAll good. Event ${eventId}.`);
await doorBrowser.close();
await browser.close();
