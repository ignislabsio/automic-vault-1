import { expect, test } from "bun:test";
import { hasNoExtendedACL, requireProtectedExecutable } from "../src/protected-path";

test("extended attributes cannot conceal a write-grant ACL", () => {
  expect(hasNoExtendedACL("-rwxr-xr-x@ 1 root wheel 123 /protected/client\n")).toBe(true);
  expect(hasNoExtendedACL("-rwxr-xr-x+ 1 root wheel 123 /protected/client\n 0: group:staff allow write\n")).toBe(false);
  expect(hasNoExtendedACL("-rwxr-xr-x@ 1 root wheel 123 /protected/client\n 0: group:staff allow write\n")).toBe(false);
  expect(hasNoExtendedACL("")).toBe(false);
});

test("an unprotected or missing executable fails before any client starts", async () => {
  await expect(requireProtectedExecutable("relative/av")).rejects.toThrow();
  await expect(requireProtectedExecutable("/tmp/ignis-nonexistent-client")).rejects.toThrow();
  await expect(requireProtectedExecutable("/Applications/nonexistent-ignis-client")).rejects.toThrow();
});

test.skipIf(process.platform !== "darwin")("the platform's immutable executable passes its full path check", async () => {
  await requireProtectedExecutable("/usr/bin/true");
});
