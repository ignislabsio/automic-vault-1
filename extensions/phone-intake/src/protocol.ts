import { createMessage, decrypt, encrypt, generateKey, readKey, readMessage, readPrivateKey } from "openpgp";

export const YOPASS = "https://secure.services.ignislabs.io";
export const MAX_VALUE_BYTES = 4 * 1024;
export const MAX_CIPHERTEXT_BYTES = 10_000;
export const REQUEST_TTL_MS = 10 * 60 * 1000;

export type Prompt = {
  version: 1;
  id: string;
  name: string;
  expires: number;
  publicKey: string;
};

export function validateValue(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.length || value.includes("\0") ||
      new TextEncoder().encode(value).length > MAX_VALUE_BYTES) {
    throw new Error("Value must be nonempty UTF-8 without NUL, at most 4 KiB");
  }
}

export async function createPrompt(name: string, now = Date.now()) {
  if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(name)) throw new Error("Invalid Secret Name");
  const keys = await generateKey({
    type: "ecc", curve: "nistP256", userIDs: [{ name: "Automic Vault intake" }],
    format: "armored",
  });
  const prompt: Prompt = {
    version: 1, id: crypto.randomUUID(), name, expires: now + REQUEST_TTL_MS,
    publicKey: keys.publicKey,
  };
  return { prompt, privateKey: await readPrivateKey({ armoredKey: keys.privateKey }) };
}

export async function seal(prompt: Prompt, value: string) {
  validateValue(value);
  if (Date.now() >= prompt.expires) throw new Error("Request expired");
  const ciphertext = await encrypt({
    message: await createMessage({ text: JSON.stringify({
      version: 1, id: prompt.id, name: prompt.name, expires: prompt.expires, value,
    }) }),
    encryptionKeys: await readKey({ armoredKey: prompt.publicKey }),
    format: "armored",
  });
  if (new TextEncoder().encode(ciphertext).length > MAX_CIPHERTEXT_BYTES) throw new Error("Encrypted message too large");
  return ciphertext;
}

export async function unseal(
  prompt: Prompt, privateKey: Awaited<ReturnType<typeof readPrivateKey>>, ciphertext: string,
) {
  if (new TextEncoder().encode(ciphertext).length > MAX_CIPHERTEXT_BYTES) throw new Error("Message too large");
  const { data } = await decrypt({
    message: await readMessage({ armoredMessage: ciphertext }), decryptionKeys: privateKey,
    format: "utf8",
    // Never release unauthenticated plaintext, including legacy unauthenticated packets.
    config: { allowUnauthenticatedMessages: false, allowUnauthenticatedStream: false, maxDecompressedMessageSize: MAX_CIPHERTEXT_BYTES },
  });
  const envelope = JSON.parse(data);
  if (envelope.version !== 1 || envelope.id !== prompt.id || envelope.name !== prompt.name ||
      envelope.expires !== prompt.expires || Date.now() >= prompt.expires) throw new Error("Request mismatch or expiry");
  validateValue(envelope.value);
  return envelope.value as string;
}

export function validSecretId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9A-Za-z]{22}$/.test(id);
}

export async function boundedJSON(response: Response, maxBytes: number) {
  if (!response.ok || !response.body) throw new Error("Transport rejected request");
  const reader = response.body.getReader();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Transport timed out")), 15_000);
  });
  let length = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      length += value.length;
      if (length > maxBytes) throw new Error("Transport response too large");
      parts.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    clearTimeout(timer!);
    await reader.cancel();
  }
}
