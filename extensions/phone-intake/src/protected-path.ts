import { lstatSync } from "node:fs";
import { isAbsolute, parse, join } from "node:path";

// A live signature check cannot undo instructions an untrusted initial image
// executed before that check. Require a privileged installation before spawn.
export async function requireProtectedExecutable(executable: string) {
  if (!isAbsolute(executable)) throw new Error("Vault executable path must be absolute");
  const root = parse(executable).root;
  const parts = executable.slice(root.length).split("/").filter(Boolean);
  if (parts.some(part => part === "." || part === "..")) throw new Error("Invalid vault path");
  let path = root;
  for (let index = -1; index < parts.length; index++) {
    if (index >= 0) path = join(path, parts[index]!);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 ||
        (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
      throw new Error("Vault installation must be root-owned and protected against replacement");
    }
    const acl = Bun.spawn(["/bin/ls", "-lde", path], { stdout: "pipe", stderr: "ignore" });
    const output = await new Response(acl.stdout).text();
    if (await acl.exited !== 0 || output.trim().split(/\s/)[0]?.includes("+")) {
      throw new Error("Vault installation has an unsupported access-control list");
    }
  }
}
