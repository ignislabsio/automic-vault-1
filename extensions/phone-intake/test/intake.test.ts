import { afterEach, expect, test } from "bun:test";
import { guardian } from "../src/guardian";
import { createPrompt, seal, unseal, YOPASS } from "../src/protocol";

const ORIGIN = "https://guardian.example.ts.net";
const VALUE = "synthetic-not-a-credential-✓";
const ID = "AbCdEfGhIjKlMnOpQrSt01";
const closers: Array<() => void> = [];
afterEach(() => { for (const close of closers.splice(0)) close(); });

async function fixture(
  save: (name: string, value: string) => Promise<void> = async () => {},
  relayValue: (ciphertext: string) => string = ciphertext => ciphertext,
) {
  let ciphertext = "";
  let reads = 0;
  let posts = 0;
  const intake = await guardian({
    name: "SYNTHETIC_PHONE_INTAKE", origin: ORIGIN, script: "", save,
    transport: (async (url, options) => {
      if (url === `${YOPASS}/create/secret`) {
        posts++;
        const sent = JSON.parse(options?.body as string);
        expect(sent.one_time).toBe(true);
        expect(sent.expiration).toBe(3600);
        expect(sent.message).not.toContain(VALUE);
        ciphertext = sent.message;
        return Response.json({ message: ID });
      }
      expect(url).toBe(`${YOPASS}/secret/${ID}`);
      expect(options?.redirect).toBe("error");
      reads++;
      if (reads > 1) return new Response(null, { status: 404 });
      return Response.json({ one_time: true, message: relayValue(ciphertext) });
    }) as typeof fetch,
  });
  closers.push(intake.close);
  const capability = new URL(intake.link).hash.slice(1);
  async function call(path: string, data: unknown = {}, overrides: Record<string, string> = {}) {
    return intake.handle(new Request(ORIGIN + path, {
      method: "POST", headers: {
        Origin: ORIGIN, "Content-Type": "application/json", Authorization: `Bearer ${capability}`, ...overrides,
      }, body: JSON.stringify(data),
    }));
  }
  ciphertext = await seal(intake.prompt, VALUE);
  return { intake, call, submit: () => call("/submit", { message: ciphertext }), get ciphertext() { return ciphertext; }, get reads() { return reads; }, get posts() { return posts; } };
}

test("encrypted round trip preserves value; wrong recipient cannot decrypt", async () => {
  const a = await createPrompt("SYNTHETIC_A");
  const b = await createPrompt("SYNTHETIC_B");
  const ciphertext = await seal(a.prompt, VALUE);
  expect(ciphertext).not.toContain(VALUE);
  expect(await unseal(a.prompt, a.privateKey, ciphertext)).toBe(VALUE);
  await expect(unseal(b.prompt, b.privateKey, ciphertext)).rejects.toThrow();
  await expect(unseal({ ...a.prompt, name: "SYNTHETIC_B" }, a.privateKey, ciphertext)).rejects.toThrow();
  await expect(unseal({ ...a.prompt, expires: 1 }, a.privateKey, ciphertext)).rejects.toThrow();
});

test("authorization rejects absent capability, wrong origin, wrong host before relay access", async () => {
  const f = await fixture();
  expect((await f.call("/prompt", {}, { Authorization: "" })).status).toBe(403);
  expect((await f.call("/submit", { id: ID }, { Origin: "https://attacker.example" })).status).toBe(403);
  expect((await f.intake.handle(new Request("http://attacker.example/"))).status).toBe(403);
  expect(f.reads).toBe(0);
  expect(f.posts).toBe(0);
  const page = await f.intake.handle(new Request(ORIGIN));
  expect(page.headers.get("Cache-Control")).toContain("no-store");
  expect(await page.text()).not.toContain(new URL(f.intake.link).hash.slice(1));
});

test("concurrent submission imports once and completion resumes once after receipt", async () => {
  let saved = 0;
  let release!: () => void;
  const pending = new Promise<void>(r => { release = r; });
  const f = await fixture(async (name, value) => {
    expect(name).toBe("SYNTHETIC_PHONE_INTAKE");
    expect(value).toBe(VALUE);
    saved++;
    await pending;
  });
  let resumed = 0;
  f.intake.completion.then(code => { expect(code).toBe(0); resumed++; });
  const first = f.submit();
  const duplicate = await f.submit();
  expect(duplicate.status).toBe(409);
  expect((await (await f.call("/status")).json()).state).toBe("saving");
  expect(resumed).toBe(0);
  release();
  const receipt = await first;
  expect((await receipt.json()).state).toBe("saved");
  expect(await f.intake.completion).toBe(0);
  expect(saved).toBe(1);
  expect(resumed).toBe(1);
  expect(f.reads).toBe(1);
  expect((await f.submit()).status).toBe(409);
});

test("vault rejection consumes request, discloses no raw exception, never reports success", async () => {
  const f = await fixture(async () => { throw new Error(VALUE); });
  const receipt = await f.submit();
  expect(receipt.status).toBe(422);
  expect(await receipt.text()).not.toContain(VALUE);
  expect(await f.intake.completion).toBe(1);
  expect((await (await f.call("/status")).json()).state).toBe("failed");
  expect((await f.submit()).status).toBe(409);
});

test("plaintext cannot reach relay; oversized input fails closed", async () => {
  const f = await fixture();
  expect((await f.call("/submit", { message: VALUE })).status).toBe(422);
  expect(f.reads).toBe(0);
  expect(f.posts).toBe(0);
  const g = await fixture();
  expect((await g.call("/submit", { message: "x".repeat(70000) })).status).toBe(422);
  expect(g.reads).toBe(0);
  expect(g.posts).toBe(0);
  await expect(seal(g.intake.prompt, "x".repeat(4097))).rejects.toThrow();
  await expect(seal(g.intake.prompt, "\0")).rejects.toThrow();
  await expect(seal(g.intake.prompt, "")).rejects.toThrow();
});

test("armor-looking plaintext fails before persistence and untrusted armor metadata is removed", async () => {
  const f = await fixture();
  const receipt = await f.call("/submit", { message: "-----BEGIN PGP MESSAGE-----\n\nplaintext\n-----END PGP MESSAGE-----" });
  expect(receipt.status).toBe(422);
  expect(f.reads).toBe(0);
  expect(f.posts).toBe(0);
  const g = await fixture();
  const incoming = g.ciphertext;
  const withComment = incoming.replace("-----BEGIN PGP MESSAGE-----", "-----BEGIN PGP MESSAGE-----\nComment: untrusted-header");
  const valid = await g.call("/submit", { message: withComment });
  expect(valid.status).toBe(200);
  expect(g.ciphertext).not.toBe(incoming);
  expect(g.ciphertext).not.toContain("untrusted-header");
});

test("a changed relay response cannot be imported or resume the owning task", async () => {
  let saves = 0;
  const f = await fixture(async () => { saves++; }, ciphertext => ciphertext + "altered");
  const result = await f.submit();
  expect(result.status).toBe(422);
  expect(await f.intake.completion).toBe(1);
  expect(saves).toBe(0);
  expect(f.posts).toBe(1);
  expect(f.reads).toBe(1);
});
