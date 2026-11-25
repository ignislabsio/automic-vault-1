import { boundedJSON, seal, type Prompt } from "./protocol";

const capability = location.hash.slice(1);
// The bearer request is never left in browser history or sent as a Referer.
history.replaceState(null, "", location.pathname);
const input = document.querySelector<HTMLTextAreaElement>("#value")!;
const form = document.querySelector<HTMLFormElement>("form")!;
const button = document.querySelector<HTMLButtonElement>("button")!;
const status = document.querySelector<HTMLElement>("#status")!;
let prompt: Prompt;

async function call(path: string, body: unknown = {}) {
  const response = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${capability}` },
    body: JSON.stringify(body), cache: "no-store", credentials: "omit", redirect: "error",
    signal: AbortSignal.timeout(300_000),
  });
  return boundedJSON(response, 16 * 1024);
}

try {
  const data = await call("/prompt");
  if (data.state !== "waiting") throw new Error("Consumed");
  prompt = data.prompt;
  document.querySelector("#name")!.textContent = `Requested Secret: ${prompt.name}. Expires in ten minutes.`;
  input.disabled = false;
  button.disabled = false;
} catch {
  status.textContent = "This request is unavailable. Ask for a new link.";
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  button.disabled = true;
  input.disabled = true;
  try {
    const ciphertext = await seal(prompt, input.value);
    input.value = "";
    status.textContent = "Sending encrypted value. Vault approval is still required; this is not saved yet.";
    const receipt = await call("/submit", { message: ciphertext });
    if (receipt.state !== "saved") throw new Error("No receipt");
    status.textContent = "Saved in Automic Vault on Ignis One.";
  } catch {
    input.value = "";
    status.textContent = "Delivery was not confirmed. Ask Engineering to check the vault receipt before requesting a new link.";
  }
});
addEventListener("pagehide", () => { input.value = ""; });
