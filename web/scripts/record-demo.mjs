// Records the product scenes missing from the hand-held footage: resale, a fan's record and the presale
// option. Real flows against the configured chain, run on the local dev server.
// Usage: pnpm dev --port 3200, then `node scripts/record-demo.mjs <outDir>`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import QRCode from "qrcode";

const base = process.env.BASE_URL ?? "http://localhost:3200";
const out = process.argv[2];
const work = mkdtempSync(join(tmpdir(), "firstrow-rec-"));
const pad = (n) => String(n).padStart(2, "0");
const marks = {};
const log = (m) => console.log(`✓ ${m}`);

const PHONE = { width: 540, height: 1168 };
const LAPTOP = { width: 1440, height: 900 };

async function actor(browser, name, viewport) {
  const context = await browser.newContext({ viewport, recordVideo: { dir: out, size: viewport }, deviceScaleFactor: 1 });
  // Show where taps land, since a recording has no finger or cursor.
  await context.addInitScript(() => {
    addEventListener(
      "pointerdown",
      (e) => {
        const dot = document.createElement("div");
        dot.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;background:rgba(21,20,18,.28);border:2px solid rgba(21,20,18,.55);pointer-events:none;z-index:99999;transition:transform .45s ease-out,opacity .45s ease-out`;
        document.documentElement.appendChild(dot);
        requestAnimationFrame(() => {
          dot.style.transform = "scale(1.7)";
          dot.style.opacity = "0";
        });
        setTimeout(() => dot.remove(), 500);
      },
      true,
    );
  });
  const page = await context.newPage();
  const started = Date.now();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
  });
  page.on("pageerror", (e) => console.log(`  [${name}]`, e.message.split("\n")[0]));
  const mark = (label) => (marks[`${name}:${label}`] = (Date.now() - started) / 1000);
  return { page, context, mark, name };
}

async function signUp({ page }, displayName) {
  await page.goto(`${base}/tickets`);
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByLabel("Name on your tickets").fill(displayName);
  await page.getByRole("button", { name: /Create my pass/ }).click();
  await page.getByText("Signed in as").waitFor();
}

async function topUp({ page }) {
  await page.getByRole("button", { name: /Add \$100 test dollars/ }).click();
  await page.getByText("$100", { exact: true }).waitFor({ timeout: 60_000 });
}

const browser = await chromium.launch();

// Host: an event with a face-value resale cap, unrecorded setup.
const host = await actor(browser, "host", LAPTOP);
await signUp(host, "Tolu");
const start = new Date(Date.now() + 40 * 60_000);
const end = new Date(start.getTime() + 4 * 3600_000);
await host.page.goto(`${base}/host/new`);
await host.page.getByLabel("Name").fill("Sunday Vinyl Session");
await host.page.getByLabel("Venue").fill("The Listening Room");
await host.page.getByLabel("City").fill("Lagos");
await host.page.getByLabel("What's it about").fill("Records, low light and a very good sound system.");
await host.page.getByLabel("Date").first().fill(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
await host.page.getByLabel("Doors open").fill(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
await host.page.getByLabel(/^Ends/).fill(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
await host.page.locator("input[inputmode=decimal]").first().fill("10");
await host.page.getByRole("button", { name: /Publish event/ }).click();
await host.page.waitForURL(/\/host\/\d+$/, { timeout: 60_000 });
const eventId = host.page.url().split("/").pop();
log(`event ${eventId}`);
await host.page.getByRole("button", { name: /Pair a door phone/ }).click();
const doorLink = (await host.page.locator("[data-value]").getAttribute("data-value", { timeout: 60_000 })).replace(/^https?:\/\/[^/]+/, base);

// Fan A buys, then lists: first above the cap, then at face value.
const a = await actor(browser, "ada", PHONE);
await signUp(a, "Ada");
await topUp(a);
await a.page.goto(`${base}/events/${eventId}`);
await a.page.getByRole("button", { name: /Buy 1/ }).click();
await a.page.getByText("You're in.").waitFor({ timeout: 60_000 });
await a.page.goto(`${base}/tickets`);
await a.page.locator('a[href^="/tickets/"]').first().waitFor();
await a.page.waitForTimeout(1200);
a.mark("list-start");
await a.page.locator('a[href^="/tickets/"]').first().click();
await a.page.getByText("Can't go? Sell this ticket.").waitFor();
await a.page.waitForTimeout(1200);
await a.page.getByText("Can't go? Sell this ticket.").scrollIntoViewIfNeeded();
await a.page.mouse.wheel(0, 260);
await a.page.waitForTimeout(1400);
const price = a.page.getByLabel(/Your price/);
await price.click();
await price.pressSequentially("15", { delay: 220 });
await a.page.waitForTimeout(600);
await a.page.getByRole("button", { name: "List for sale" }).click();
await a.page.getByText(/caps resale at \$10/).waitFor({ timeout: 30_000 });
await a.page.getByText(/caps resale at \$10/).scrollIntoViewIfNeeded();
a.mark("refused");
await a.page.waitForTimeout(2600);
await price.fill("");
await price.pressSequentially("10", { delay: 220 });
await a.page.waitForTimeout(500);
await a.page.getByRole("button", { name: "List for sale" }).click();
await a.page.getByText(/On sale for \$10/).waitFor({ timeout: 60_000 });
a.mark("listed");
await a.page.waitForTimeout(3000);
a.mark("list-end");
log("ada listed her ticket");

// Fan B sees the listing on the event page and buys it.
const b = await actor(browser, "kemi", PHONE);
await signUp(b, "Kemi");
await topUp(b);
await b.page.goto(`${base}/events/${eventId}`);
await b.page.getByText(/resale ticket from fans/).waitFor({ timeout: 30_000 });
await b.page.getByText(/resale ticket from fans/).scrollIntoViewIfNeeded();
await b.page.mouse.wheel(0, -160);
await b.page.waitForTimeout(1500);
b.mark("resale-start");
await b.page.waitForTimeout(1800);
await b.page.getByText(/resale ticket from fans/).click();
await b.page.waitForTimeout(2200);
await b.page.getByRole("button", { name: /^Buy · \$10/ }).click();
b.mark("resale-bought-click");
await b.page.getByRole("link", { name: /Open my ticket/ }).waitFor({ timeout: 60_000 });
await b.page.getByRole("link", { name: /Open my ticket/ }).scrollIntoViewIfNeeded();
b.mark("resale-owned");
await b.page.waitForTimeout(3000);
b.mark("resale-end");
log("kemi bought the resale ticket");

// The door scans Kemi in (fake camera fed with her code), so she has a record to show.
await b.page.goto(`${base}/tickets`);
await b.page.locator('a[href^="/tickets/"]').first().click();
await b.page.getByRole("button", { name: /Show entry code/ }).click();
const code = await b.page.locator("[data-value]").getAttribute("data-value", { timeout: 30_000 });
const png = join(work, "code.png");
const y4m = join(work, "code.y4m");
await QRCode.toFile(png, code, { width: 480, margin: 4 });
execFileSync("ffmpeg", ["-loglevel", "error", "-loop", "1", "-i", png, "-t", "3", "-vf", "pad=640:480:80:0:white", "-pix_fmt", "yuv420p", y4m]);
const doorBrowser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`] });
const door = await (await doorBrowser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["camera"] })).newPage();
await door.goto(doorLink);
await door.getByText(/Admit 1/).waitFor({ timeout: 60_000 });
await doorBrowser.close();
await b.page.getByText("Welcome in.").waitFor({ timeout: 30_000 });
await b.page.waitForTimeout(1500);
log("kemi checked in");

await b.page.goto(`${base}/tickets`);
await b.page.getByRole("link", { name: "My record" }).waitFor();
await b.page.waitForTimeout(1200);
b.mark("record-start");
await b.page.getByRole("link", { name: "My record" }).click();
await b.page.getByText("Standing with each host").waitFor({ timeout: 30_000 });
await b.page.waitForTimeout(2500);
await b.page.mouse.wheel(0, 420);
await b.page.waitForTimeout(3500);
b.mark("record-end");
log("kemi's record");

// Host: the presale option on a new event.
await host.page.goto(`${base}/host/new`);
await host.page.getByLabel("Name").fill("Sunday Vinyl Session Vol. 2");
await host.page.getByText("Presale for people who've shown up before").scrollIntoViewIfNeeded();
await host.page.mouse.wheel(0, 200);
await host.page.waitForTimeout(1500);
host.mark("presale-start");
await host.page.waitForTimeout(1500);
await host.page.getByText("Presale for people who've shown up before").click();
await host.page.waitForTimeout(3500);
host.mark("presale-end");
log("presale option");

const videos = {};
for (const actor of [host, a, b]) {
  const video = actor.page.video();
  await actor.context.close();
  videos[actor.name] = await video.path();
}
await browser.close();
writeFileSync(join(out, "marks.json"), JSON.stringify({ eventId, marks, videos }, null, 2));
console.log(JSON.stringify({ eventId, marks, videos }, null, 2));
