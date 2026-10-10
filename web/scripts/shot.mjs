// Screenshots a page at desktop and mobile widths: node scripts/shot.mjs /path [outDir]
import { chromium } from "playwright";

const path = process.argv[2] ?? "/";
const out = process.argv[3] ?? "/tmp";
const base = process.env.BASE_URL ?? "http://localhost:3200";
const browser = await chromium.launch();
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  page.on("pageerror", (e) => console.log(`[${name}] pageerror`, e.message));
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const file = `${out}/${name}${path.replace(/\W+/g, "-")}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
}
await browser.close();
