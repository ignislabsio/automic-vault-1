import { boundedJSON, createPrompt, MAX_CIPHERTEXT_BYTES, seal, unseal, validSecretId, YOPASS } from "./protocol";

type Options = {
  name: string;
  origin: string;
  script: string;
  save: (name: string, value: string) => Promise<void>;
  transport?: typeof fetch;
};

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
};

export async function guardian(options: Options) {
  const { prompt, privateKey } = await createPrompt(options.name);
  const capability = crypto.getRandomValues(new Uint8Array(32)).toHex();
  const transport = options.transport ?? fetch;
  let state: "waiting" | "saving" | "saved" | "failed" = "waiting";
  let result = 1;
  let finish!: (code: number) => void;
  const completion = new Promise<number>(resolve => { finish = resolve; });
  const timeout = setTimeout(() => {
    state = "failed";
    finish(1);
  }, prompt.expires - Date.now());

  function response(body: unknown, status = 200) {
    return Response.json(body, { status, headers: HEADERS });
  }

  async function handle(request: Request) {
    const url = new URL(request.url);
    // A proxy must preserve Host. No forwarded header can choose the authority.
    if (url.host !== new URL(options.origin).host) return response({ error: "Wrong host" }, 403);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(PAGE, { headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } });
    }
    if (request.method === "GET" && url.pathname === "/phone.js") {
      return new Response(options.script, { headers: { ...HEADERS, "Content-Type": "text/javascript" } });
    }
    if (request.method === "GET" && url.pathname === "/phone.css") {
      return new Response(CSS, { headers: { ...HEADERS, "Content-Type": "text/css" } });
    }
    if (request.method !== "POST" || request.headers.get("Origin") !== options.origin ||
        request.headers.get("Authorization") !== `Bearer ${capability}` ||
        request.headers.get("Content-Type") !== "application/json") return response({ error: "Unauthorized" }, 403);
    if (Date.now() >= prompt.expires) return response({ error: "Expired" }, 410);
    if (url.pathname === "/prompt") return response({ prompt, state });
    if (url.pathname === "/status") return response({ state });
    if (url.pathname !== "/submit") return response({ error: "Not found" }, 404);
    if (state !== "waiting") return response({ error: "Request already consumed" }, 409);

    // Claim before any await: simultaneous submissions cannot both import.
    state = "saving";
    // Input expiry must not terminate an already approved Keychain transaction.
    clearTimeout(timeout);
    let value = "";
    try {
      const body = await boundedJSON(new Response(request.body), MAX_CIPHERTEXT_BYTES + 4096);
      if (typeof body.message !== "string" || new TextEncoder().encode(body.message).length > MAX_CIPHERTEXT_BYTES ||
          !body.message.startsWith("-----BEGIN PGP MESSAGE-----")) throw new Error("Invalid ciphertext");
      // Armor alone is not proof of encryption. Authenticate locally before persistence.
      value = await unseal(prompt, privateKey, body.message);
      // Fresh armor prevents caller-controlled comments or trailing plaintext reaching YoPass.
      const ciphertext = await seal(prompt, value);
      const created = await boundedJSON(await transport(`${YOPASS}/create/secret`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: ciphertext, expiration: 3600, one_time: true }),
        redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store",
      }), 1024);
      if (!validSecretId(created.message)) throw new Error("Invalid transfer identifier");
      const stored = await transport(`${YOPASS}/secret/${created.message}`, {
        redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store",
      });
      const encrypted = await boundedJSON(stored, MAX_CIPHERTEXT_BYTES + 4096);
      if (encrypted.one_time !== true || encrypted.message !== ciphertext) throw new Error("Invalid transfer");
      if (Date.now() >= prompt.expires) throw new Error("Expired");
      await options.save(prompt.name, value);
      // Successful save means the signed Gate Client acknowledged custody.
      state = "saved";
      result = 0;
      return response({ state });
    } catch {
      state = "failed";
      return response({ state, error: "No confirmed delivery. Check vault history before retrying; an approved availability change may remain." }, 422);
    } finally {
      value = "";
      finish(result);
    }
  }

  return {
    handle, completion, prompt,
    link: `${options.origin}/#${capability}`,
    close() { clearTimeout(timeout); finish(result); },
  };
}

const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Add a Secret</title><link rel="stylesheet" href="/phone.css"><main><h1>Add a Secret</h1><p id="name">Opening request…</p><p>Vault approval will make every Value of this Secret available while Ignis One is locked, after its first unlock following a restart. This availability change can remain if saving fails. Existing authorization rules still apply.</p><form autocomplete="off"><label for="value">Secret Value</label><textarea id="value" rows="4" autocomplete="off" autocapitalize="off" spellcheck="false" required disabled></textarea><button disabled>Encrypt and send</button></form><p id="status" role="status"></p></main><script type="module" src="/phone.js"></script></html>`;
const CSS = `:root{font:18px system-ui;color-scheme:light dark}main{max-width:28rem;margin:3rem auto;padding:1rem}label,textarea,button{display:block;width:100%;box-sizing:border-box}textarea,button{font:inherit;padding:.8rem;margin:.6rem 0}textarea{-webkit-text-security:disc}button{cursor:pointer}#status{line-height:1.5}`;
