import { expect, test } from "bun:test";
import { saveToVault } from "../src/save-to-vault";

const target = { executable: "/synthetic/av", requirement: "synthetic-exact-signer" };

test("a replaced or exited vault client receives no plaintext", async () => {
  for (const [verified, exitCode] of [[false, null], [true, 1]] as const) {
    const writes: string[] = [];
    let killed = false;
    await expect(saveToVault(target, "SYNTHETIC", "synthetic-value", {
      spawnSave: () => ({
        pid: 4321, exitCode, exited: Promise.resolve(1),
        stdin: { write: value => { writes.push(value); return value.length; }, end() {} },
        kill() { killed = true; },
      }),
      verifyProcess: async (pid, requirement) => {
        expect(pid).toBe(4321);
        expect(requirement).toBe(target.requirement);
        expect(writes).toEqual([]);
        return verified;
      },
    })).rejects.toThrow("live signature verification");
    expect(writes).toEqual([]);
    expect(killed).toBe(exitCode === null);
  }
});

test("custody failure never reports success after a verified pipe reader", async () => {
  await expect(saveToVault(target, "SYNTHETIC", "synthetic-value", {
    spawnSave: () => ({
      pid: 4321, exitCode: null, exited: Promise.resolve(1),
      stdin: { write: value => value.length, end() {} }, kill() {},
    }),
    verifyProcess: async () => true,
  })).rejects.toThrow("did not acknowledge");
});
