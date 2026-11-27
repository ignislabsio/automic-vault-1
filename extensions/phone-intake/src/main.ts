import { guardian } from "./guardian";
import { vaultTarget } from "./vault-target";
import { saveToVault } from "./save-to-vault";
import { requireProtectedExecutable } from "./protected-path";

const args = process.argv.slice(2);
const ignisLocal = args[0] === "--ignis-local";
if (ignisLocal) args.shift();
const [name, origin, portText] = args;
if (!name || !origin || !portText || args.length !== 3 ||
    !/^https:\/\/[a-z0-9.-]+\.ts\.net(?::[0-9]+)?$/.test(origin) ||
    !/^[0-9]+$/.test(portText) || Number(portText) < 1024 || Number(portText) > 65535) {
  console.error("Usage: bun src/main.ts [--ignis-local] SECRET_NAME https://HOST.ts.net[:PORT] LOCAL_PORT");
  process.exit(1);
}

// The Ignis build has its own signer and fresh custody; it cannot impersonate
// the upstream app. Always keep the client paired with its selected helper.
const target = vaultTarget(ignisLocal);
const av = target.executable;
if (target.requiresProtectedPath) {
  try { await requireProtectedExecutable(av); }
  catch {
    console.error("The Ignis vault needs its protected administrator-installed location. No prompt created or Secret accepted.");
    process.exit(1);
  }
}
const signature = Bun.spawn([
  "/usr/bin/codesign", "--verify", "--strict", "-R",
  target.requirement,
  av,
], { stdout: "ignore", stderr: "ignore" });
if (await signature.exited !== 0) {
  console.error("The installed av Gate Client failed signature verification. No prompt created.");
  process.exit(1);
}
const help = Bun.spawn([av, "save", "--help"], { stdout: "pipe", stderr: "ignore" });
if (await help.exited !== 0 || !(await new Response(help.stdout).text()).includes("--available-while-locked")) {
  console.error("The installed signed av does not support --available-while-locked. No prompt created or Secret accepted.");
  process.exit(1);
}

const build = await Bun.build({ entrypoints: [new URL("./phone.ts", import.meta.url).pathname], target: "browser", minify: true });
if (!build.success || build.outputs.length !== 1) {
  console.error("Phone bundle failed to build");
  process.exit(1);
}
const intake = await guardian({
  name, origin: new URL(origin).origin, script: await build.outputs[0].text(),
  async save(key, value) {
    await saveToVault(target, key, value);
  },
});
const server = Bun.serve({
  hostname: "127.0.0.1", port: Number(portText), idleTimeout: 255,
  maxRequestBodySize: 14 * 1024, fetch: intake.handle,
  error() { return new Response("Request failed", { status: 500, headers: { "Cache-Control": "no-store" } }); },
});
console.log(intake.link);
const code = await intake.completion;
console.log(code === 0 ? `Vault acknowledged ${name}.` : `No confirmed vault delivery for ${name}.`);
// Allow the receipt response to drain; this is a foreground, one-request process.
await Bun.sleep(1000);
server.stop(true);
intake.close();
process.exit(code);
