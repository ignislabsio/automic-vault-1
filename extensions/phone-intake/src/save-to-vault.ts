type SaveChild = {
  pid: number;
  exitCode: number | null;
  exited: Promise<number>;
  stdin: { write(value: string): number | Promise<number>; end(): unknown };
  kill(): unknown;
};

type Runtime = {
  spawnSave(executable: string, name: string): SaveChild;
  verifyProcess(pid: number, requirement: string): Promise<boolean>;
};

const runtime: Runtime = {
  spawnSave(executable, name) {
    return Bun.spawn([executable, "save", "--stdin", "--available-while-locked", name], {
      stdin: "pipe", stdout: "ignore", stderr: "ignore",
    });
  },
  async verifyProcess(pid, requirement) {
    // Validate the actual pipe reader, not a path that can be replaced after
    // the prompt is opened. No Value has been written to this process yet.
    const verifier = Bun.spawn([
      "/usr/bin/codesign", "--verify", "--strict", "--verbose=1", "-R", requirement, String(pid),
    ], { stdout: "ignore", stderr: "ignore" });
    const timer = setTimeout(() => verifier.kill(), 15_000);
    try { return await verifier.exited === 0; }
    finally { clearTimeout(timer); }
  },
};

export async function saveToVault(
  target: { executable: string; requirement: string; requiresProtectedPath?: boolean }, name: string, value: string,
  execution: Runtime = runtime,
) {
  if (target.requiresProtectedPath) await requireProtectedExecutable(target.executable);
  const child = execution.spawnSave(target.executable, name);
  const timer = setTimeout(() => child.kill(), 180_000);
  try {
    if (!await execution.verifyProcess(child.pid, target.requirement) || child.exitCode !== null) {
      throw new Error("Vault process failed live signature verification");
    }
    await child.stdin.write(value);
    await child.stdin.end();
    if (await child.exited !== 0) throw new Error("Vault did not acknowledge save");
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill();
  }
}
import { requireProtectedExecutable } from "./protected-path";

