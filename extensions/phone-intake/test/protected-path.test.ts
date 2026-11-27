import { expect, test } from "bun:test";
import { requireProtectedExecutable } from "../src/protected-path";

test("an unprotected or missing executable fails before any client starts", async () => {
  await expect(requireProtectedExecutable("relative/av")).rejects.toThrow();
  await expect(requireProtectedExecutable("/tmp/ignis-nonexistent-client")).rejects.toThrow();
  await expect(requireProtectedExecutable("/Applications/nonexistent-ignis-client")).rejects.toThrow();
});

test.skipIf(process.platform !== "darwin")("the platform's immutable executable passes its full path check", async () => {
  await requireProtectedExecutable("/usr/bin/true");
});
