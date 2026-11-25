import { chromium } from "playwright";
import { guardian } from "../src/guardian";

// Explicit opt-in: creates one synthetic, one-time encrypted record on live YoPass.
if (process.argv[2] !== "--live-yopass") throw new Error("Pass --live-yopass for the synthetic transport check");
const bundle = await Bun.build({ entrypoints: [new URL("../src/phone.ts", import.meta.url).pathname], target: "browser", minify: true });
if (!bundle.success) throw new Error("Phone build failed");
const value = `synthetic-${crypto.randomUUID()}\nsecond-line`;
let received = 0;
let postedId: string | undefined;
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) { return intake.handle(request); } });
const origin = `http://127.0.0.1:${server.port}`;
const intake = await guardian({
  name: "IGN_1871_SYNTHETIC_TRANSPORT", origin, script: await bundle.outputs[0].text(),
  transport: (async (url, options) => {
    const response = await fetch(url, options);
    console.log(`YoPass ${options?.method ?? "GET"}: HTTP ${response.status}`);
    if (options?.method === "POST") {
      const body = JSON.parse(options.body as string);
      if (body.message.includes(value)) throw new Error("Plaintext transport");
      const created = await response.clone().json();
      postedId = created.message;
      console.log(`Transfer identifier length: ${typeof postedId === "string" ? postedId.length : "absent"}`);
    }
    return response;
  }) as typeof fetch,
  async save(name, actual) {
    if (name !== "IGN_1871_SYNTHETIC_TRANSPORT" || actual !== value) throw new Error("Wrong destination or value");
    // Deliberate test sink, not a vault import. No persistent plaintext fixture.
    received++;
  },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", () => errors.push("Browser error"));
  let browserPosts = 0;
  page.on("request", request => {
    if (request.method() === "POST") {
      browserPosts++;
      if (request.postData()?.includes(value)) errors.push("Plaintext browser request");
    }
  });
  await page.goto(intake.link);
  await page.locator("#value:enabled").waitFor();
  if (new URL(page.url()).hash) throw new Error("Capability remained in history");
  await page.locator("#value").fill(value);
  await page.locator("button").click();
  await page.waitForFunction(() => /Saved in|not confirmed/.test(document.querySelector("#status")!.textContent!), { timeout: 30_000 });
  if (!(await page.locator("#status").textContent())?.startsWith("Saved in")) throw new Error("Phone reports no delivery confirmation");
  if (await page.locator("#value").inputValue() !== "") throw new Error("Input not cleared");
  const persistent = await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length,
    caches: (await caches.keys()).length,
    databases: (await indexedDB.databases()).length,
    cookies: document.cookie,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  if (Object.values(persistent).some(item => item !== 0 && item !== "")) throw new Error("Browser persistence");
  if (errors.length || received !== 1 || browserPosts !== 2) throw new Error("Browser or single-delivery check failed");
  if (!postedId) throw new Error("Missing live transfer identifier");
  const replay = await fetch(`https://secure.services.ignislabs.io/secret/${postedId}`, { redirect: "error" });
  if (replay.status !== 404) throw new Error("Live YoPass replay not rejected");
  if (await intake.completion !== 0) throw new Error("Completion failed");
  console.log("Mobile Chromium -> live YoPass -> in-memory test sink passed; replay HTTP 404; browser storage empty. No vault import or physical phone test.");
} finally {
  await browser?.close();
  server.stop(true);
  intake.close();
}
