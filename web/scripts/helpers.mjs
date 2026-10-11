export const base = process.env.BASE_URL ?? "http://localhost:3200";
export const pad = (n) => String(n).padStart(2, "0");
export const step = (label) => console.log(`✓ ${label}`);

// A browser context with its own virtual passkey authenticator that supports PRF.
export async function withPasskey(browser, viewport = { width: 390, height: 844 }) {
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
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.split("\n")[0]));
  return page;
}

export async function signUp(page, name) {
  await page.goto(`${base}/tickets`);
  await page.getByRole("button", { name: "Sign in" }).first().click();
  await page.getByLabel("Name on your tickets").fill(name);
  await page.getByRole("button", { name: /Create my pass/ }).click();
  await page.getByText("Signed in as").waitFor();
}

export async function topUp(page) {
  await page.goto(`${base}/tickets`);
  await page.getByRole("button", { name: "+ Add test dollars" }).click();
  await page.getByText(/Balance \$100/).waitFor({ timeout: 60_000 });
}

export async function createEvent(page, { name, price = "5", minutesFromNow = 30 }) {
  const start = new Date(Date.now() + minutesFromNow * 60_000);
  const end = new Date(start.getTime() + 3 * 3600_000);
  await page.goto(`${base}/host/new`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Venue").fill("Test Hall");
  await page.getByLabel("City").fill("Lagos");
  await page.getByLabel("Date").first().fill(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
  await page.getByLabel("Doors open").fill(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  await page.getByLabel(/^Ends/).fill(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
  await page.locator("input[inputmode=decimal]").first().fill(price);
  await page.getByRole("button", { name: /Publish event/ }).click();
  await page.waitForURL(/\/host\/\d+$/, { timeout: 60_000 });
  return page.url().split("/").pop();
}

export async function buy(page, eventId) {
  await page.goto(`${base}/events/${eventId}`);
  await page.getByRole("button", { name: /Buy 1/ }).click();
  await page.getByText("You're in.").waitFor({ timeout: 60_000 });
}
