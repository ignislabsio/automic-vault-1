# ADR 0085: Experimental phone intake companion

Status: experimental, not a production authority change
Date: 2026-11-25

## Context

IGN-1871 requests an Ignis-owned fork that can receive a credential from a phone
while Ignis One is locked, reusing the existing Ignis YoPass deployment. The
existing iPhone Approval relay authorizes requests; it does not carry Secret
Values. Blessed Scripts do not waive Secret mutation Approval. Forking or
ad-hoc signing must not grant access to existing native Secret Custody.

## Decision

Add an isolated, opt-in companion under `extensions/phone-intake`. Its encrypted
transport is not an Authorization Decision. The companion uses the already
installed, strictly verified upstream Gate Client and its ordinary import
Approval. No native gate, signing requirement, availability default, or existing
Secret changes as a consequence of creating a phone prompt.

Each request binds one immutable Secret Name, random identifier, public
encryption key and expiry. A separate random bearer capability authorizes
offering one candidate Value. Exact Origin and Host checks plus atomic
one-submission claiming protect the intake endpoint. Possession of the link
is not proof of Byron's identity and cannot substitute for native Approval.

The phone encrypts before sending. The companion validates the authenticated
envelope before relaying anything to YoPass and generates fresh ciphertext
to prevent plaintext outer armor metadata or extra recipient packets from
crossing that persistence boundary. YoPass gets ciphertext only. The companion
requires the retrieved ciphertext to match before piping the Value into the
native client. Native custody acknowledgement precedes a success receipt and
the foreground process's zero exit. Loss of a reply is an ambiguous outcome,
requiring native history inspection before retrying.

The availability request retains ADR 0083's all-Value scope and failure
semantics. Availability is not authorization. The prototype must fail before
intake if the installed signed client does not advertise the explicit option;
an older helper rejects its distinct XPC operation rather than silently
downgrading. Supporting one client option does not prove an enrolled phone,
an eligible Approval route, or a successful locked-Keychain mutation.

## Consequences

This adds a transport trust boundary around ephemeral plaintext in the phone
and companion. It does not replace the Local Execution Boundary. Same-user
compromise of the interpreter, source or dependencies remains out of scope;
no new automatic authority is granted to them. There is no persistence of
plaintext at the application layer, but no JavaScript memory-zeroization claim.

The companion installs no service, changes no ingress, and does not unlock,
update, restart or reconfigure the installed native app. The existing YoPass
server needs no feature changes. The request lifetime is process-local;
there is no durable continuation guarantee across a crash. Before production
adoption, establish the installed signed app/client capability, native phone
Approval eligibility, exact-source security review, protected HTTPS ingress,
and a physical-phone-to-custody receipt under an observed locked session.

See the [companion runbook](../../extensions/phone-intake/README.md) for exact
transport, limits, test boundaries and unsupported installed-version behavior.
