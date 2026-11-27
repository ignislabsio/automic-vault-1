import { lstatSync } from "node:fs";
import { isAbsolute, parse, join } from "node:path";

export function hasNoExtendedACL(output: string) {
  const lines = output.trimEnd().split("\n");
  const mode = lines[0]?.trim().split(/\s/)[0] ?? "";
  // macOS shows @ instead of + when both xattrs and an ACL exist. The -e
  // listing still includes ACL rows, so the mode marker alone is insufficient.
  return lines.length === 1 && /^[-d][rwxStTs-]{9}[@.]?$/.test(mode);
}

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
    const acl = Bun.spawn(["/bin/ls", "-ldeb", path], { stdout: "pipe", stderr: "ignore" });
    const output = await new Response(acl.stdout).text();
    if (await acl.exited !== 0 || !hasNoExtendedACL(output)) {
      throw new Error("Vault installation has an unsupported access-control list");
    }
  }
}
