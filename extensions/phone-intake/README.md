# Phone intake prototype

Tracking: [IGN-1871](https://linear.app/ignislabs/issue/IGN-1871/one-secure-phone-to-vault-route-for-every-company-secret).

This companion is an additive prototype in the Ignis-owned fork. It does not
modify Secret Custody, Authorization Policy, the Approval relay, or existing
Values. The upstream Apache-2.0 license remains unchanged; OpenPGP.js is LGPL-3.0
and remains a separately installed, pinned dependency. No upstream submission
has been made.

Read [domain language](../../docs/domain-language.md),
[architecture](../../docs/architecture.md), and [ADR 0085](../../docs/adr/0085-phone-intake-prototype.md)
for the security boundaries. This is not an installed or verified locked-Mac
credential intake service.

## Run

Requires Bun 1.3.14, a verified installed upstream-signed `av` supporting
`save --stdin --available-while-locked`, and a separately configured private
Tailscale HTTPS reverse proxy preserving Host to the selected loopback port.
The companion never provisions ingress, enables Funnel, installs a service,
changes Keychain availability without Approval, or restarts anything.

From this directory:

```sh
bun install --frozen-lockfile
bun src/main.ts COMPANY_SERVICE_API_KEY https://YOUR-MAC.YOUR-TAILNET.ts.net:8664 8664
```

For the separately signed local Ignis build, add `--ignis-local` before the
Secret Name. This selects only the Ignis app at
`/Applications/Ignis Automic Vault.app`, signed by Ignis team `8G29DNN4U4`.
The default still selects only the upstream publisher. Neither mode accepts
an arbitrary client path or signer. The Ignis app uses fresh custody and its
own Approval setup; an upstream phone enrollment does not approve its saves.
Building or installing this app is not proof of phone or locked-Mac delivery.
Immediately before sending a Value, the guardian starts the selected client
with an empty stdin pipe, validates that running process's exact signer, and
then writes only to that same pipe. Replacing a pathname after prompt creation
cannot substitute an unsigned recipient. Failed verification sends no Value.

Use a dedicated, reviewed tailnet listener; do not reuse a public Funnel route.
Only the printed phone link carries the one-request bearer capability. Treat
it as permission to offer one candidate Value, keep it within the intended
private workflow, and never record it in an issue or an access log. Possession
of that link does not approve a vault mutation. Native Approval remains a
separate requirement; phone Approval must already be eligible and configured.
The companion does not purchase or bypass an iPhone Approval subscription.

The foreground process accepts one candidate and exits zero only after the
signed Gate Client acknowledges saving. A department can resume its task on
that success exit once. Nonzero exit requires inspecting native Authorization
History before retrying: losing a response or terminating a process cannot
prove a Keychain write did not commit. There is no durable work queue or crash
recovery guarantee, so this prototype must not drive an irreversible continuation.

Open the link on a phone connected to the tailnet, paste the Value, and select
Encrypt and send. Complete the existing native Approval if requested. The page
shows success only after receiving the guardian's confirmed-save response.
On browsers supporting `-webkit-text-security` (including iPhone Safari), the
multiline field is visually obscured; that presentation is not an access
control or a promise that screenshots cannot capture a Value.

Limits: ten-minute input eligibility; 4 KiB UTF-8 Values without NUL; 10,000-byte
encrypted armor. Some heavily escaped Values can hit the encrypted limit first.
Newlines and received whitespace are preserved. Saving explicitly requests
Available While Locked for **all Values of that Secret Name**. The native
Approval covers that scope. An approved availability change can persist if
the Value write subsequently fails. Existing authorization rules still apply.

## Data path

1. The foreground guardian generates an ephemeral P-256 OpenPGP key pair and
   one-request capability in memory. The phone receives only the public key,
   fixed Secret Name, request identifier, and expiry after authorization.
2. The phone removes the capability fragment from its history and encrypts
   the request-bound Value in memory. It sends ciphertext to the same origin,
   with an exact Origin and bearer check. The guardian claims the request
   before any asynchronous work, making subsequent submissions fail closed.
3. The guardian authenticates and validates the envelope in memory, then
   re-encrypts it locally so untrusted armor comments or extra recipients are
   never forwarded. It POSTs only newly generated ciphertext to the existing
   `https://secure.services.ignislabs.io/create/secret` endpoint with
   `one_time=true`, then GETs `/secret/<22-character base62 ID>`. The retrieved
   ciphertext must match exactly. Redirects are rejected. No disabled request,
   receipt, OIDC, or paid feature is used. Browser CORS configuration is unchanged.
4. The plaintext travels through a pipe to the installed signed Gate Client:
   `av save --stdin --available-while-locked NAME`. Values never appear in
   arguments or environment variables. The guardian suppresses child output;
   native Approval and custody enforce the existing security model. A fork
   build cannot impersonate the signed Gate Client or access existing custody.
5. Success is reported only after that process exits zero. Failure consumes
   the request and does not permit replay. The input timeout does not cancel
   a save that has already started; the save has a separate three-minute bound.

The application uses no analytics, external scripts, cookies, storage APIs,
service worker, request-body log, plaintext file, or application database. All
responses prohibit caching. YoPass may persist ciphertext until its one-time
read or one-hour expiry. This is not a claim that infrastructure never logs
metadata, or that JavaScript, the browser, or the OS offers guaranteed memory
zeroization or protection against a compromised host. Trust includes the
guardian source, pinned dependencies, browser, tailnet ingress and TLS, and
the existing native vault. A captured capability permits denial of service
by consuming the one request; it does not authorize native saving.

## Verification

```sh
bun test
bun build src/phone.ts --target browser --outfile /tmp/phone-intake.js
# Opt-in: one synthetic live YoPass transfer, a headless mobile Chromium viewport,
# an in-memory test sink, and a second GET verifying HTTP 404. No vault write.
bun verify/browser.ts --live-yopass
```

The live verifier deliberately substitutes an in-memory sink for the Gate
Client. Its displayed test success is **not** evidence of a vault import,
physical iPhone submission, native phone Approval, or locked-device behavior.
The default CI checks authorization, request binding, single-submission races,
failure receipts, input limits, and browser bundling without production traffic.

On Ignis One on 25 November 2026, installed signed `av` 4.23.1 lacks the required
flag; the real launcher refuses before creating a prompt or accepting a Value.
Current upstream source 4.25.2 implements it with a distinct XPC operation
that older helpers reject. The installed app/client pair and actual native
phone Approval must support that operation before locked custody can be
verified. No real phone link or completed vault receipt is claimed here.
