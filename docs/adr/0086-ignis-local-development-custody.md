# ADR 0086: Ignis local development custody

Status: development only

The Ignis local flavor uses an Apple Development identity and its matching
Mac development provisioning profile. The bundle, per-user LaunchAgent, Mach
service, history directory, and two Keychain access groups are independent of
upstream. The helper and bundled CLI authenticate each other using the Ignis
Apple team and exact signing identifiers. The helper accepts only the
built-in Gate Client and the app itself. The local XPC operation catalog covers
generic Secret storage and application, metadata, and approved settings.

Build with `IGNIS_VAULT_PROFILE` pointing to the Apple profile and
`IGNIS_VAULT_SIGNING_IDENTITY` set to the installed Apple Development certificate
fingerprint, then run `scripts/build.sh --ignis-local`. The result is
`target/swift/Ignis Automic Vault.app`. The installed path is
`/Library/Application Support/Ignis/Automic Vault.app`. Installation requires
an administrator to establish root ownership, non-writable group and world
permissions, and no symlinks or ACL grants to write on the path and app. Use
the bundled CLI directly. The build does not install the app or overwrite the
upstream CLI. The packaged app does not use the upstream updater or install
CLI shims.

Start with fresh Secret Values and Authorization Policy. The provisioning
profile must authorize each target Mac. Keep the signing key under human
control. Code requirements scoped to the signing team cannot protect against
an actor able to sign new binaries with that team's identity. The local flavor
does not authorize vendor Isotope execution or adapt its installation paths.

Secret Authorization and Availability are unchanged. The separate
[`IgnisLocal` iOS companion](../../src/ios/ApprovalApp/IGNIS-LOCAL.md) joins the
Ignis Approval group and uses the same private relay as the matching Mac
flavor. Its internal build eligibility replaces upstream StoreKit eligibility;
it does not replace explicit human Approval or the configured biometric check.
The notification extension uses the same isolated group and its own bundle ID.
Successful signing does not establish enrollment, notification delivery,
locked phone intake, or iCloud delivery. Verify runtime policy and custody
separately on each Mac before using operational Values.

The Ignis relay binds only to loopback behind Tailscale Serve. Serve strips
client-supplied identity headers and supplies the authenticated user's login;
the relay accepts exactly the configured owner. Loopback callers remain inside
the trusted host boundary. This check is an ingress restriction, never native
Approval authority: room credentials, request binding and human Approval remain
required. Installer routes serve only the three fixed, read-only assets loaded
at startup; the IPA must match the independently validated signed export.
