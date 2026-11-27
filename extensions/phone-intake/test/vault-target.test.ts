import { expect, test } from "bun:test";
import { vaultTarget } from "../src/vault-target";

test("local fork and upstream intake never borrow one another's publisher", () => {
  const upstream = vaultTarget(false);
  const local = vaultTarget(true);
  expect(upstream.executable).toBe("/Applications/Automic Vault.app/Contents/MacOS/av");
  expect(local.executable).toBe("/Applications/Ignis Automic Vault.app/Contents/MacOS/av");
  expect(local.requirement).toContain('anchor apple generic');
  expect(local.requirement).toContain('identifier "com.automicvault.av"');
  expect(local.requirement).toContain('"8G29DNN4U4"');
  expect(local.requirement).not.toContain("ZU76A67LGU");
  expect(upstream.requirement).toContain('"ZU76A67LGU"');
  expect(upstream.requirement).not.toContain("8G29DNN4U4");
});
