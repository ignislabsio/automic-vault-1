import { guardian } from "./guardian";

const [name, origin, portText] = process.argv.slice(2);
if (!name || !origin || !portText || process.argv.length !== 5 ||
    !/^https:\/\/[a-z0-9.-]+\.ts\.net(?::[0-9]+)?$/.test(origin) ||
    !/^[0-9]+$/.test(portText) || Number(portText) < 1024 || Number(portText) > 65535) {
  console.error("Usage: bun src/main.ts SECRET_NAME https://HOST.ts.net[:PORT] LOCAL_PORT");
  process.exit(1);
}

// Reuse the installed signed Gate Client. An unsigned fork cannot impersonate it.
const signature = Bun.spawn([
  "/usr/bin/codesign", "--verify", "--strict", "-R",
  '=anchor apple generic and identifier "com.automicvault.av" and certificate leaf[subject.OU] = "ZU76A67LGU"',
  "/usr/local/bin/av",
], { stdout: "ignore", stderr: "ignore" });
if (await signature.exited !== 0) {
  console.error("The installed av Gate Client failed signature verification. No prompt created.");
  process.exit(1);
}
const help = Bun.spawn(["/usr/local/bin/av", "save", "--help"], { stdout: "pipe", stderr: "ignore" });
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
    const child = Bun.spawn(["/usr/local/bin/av", "save", "--stdin", "--available-while-locked", key], {
      stdin: "pipe", stdout: "ignore", stderr: "ignore",
    });
    const timer = setTimeout(() => child.kill(), 180_000);
    try {
      child.stdin.write(value);
      child.stdin.end();
      if (await child.exited !== 0) throw new Error("Vault did not acknowledge save");
    } finally {
      clearTimeout(timer);
    }
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
