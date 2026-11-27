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
`target/swift/Ignis Automic Vault.app`. Use the bundled CLI directly. The build
does not install the app or overwrite the upstream CLI. The packaged app does
not use the upstream updater or install CLI shims.

Start with fresh Secret Values and Authorization Policy. The provisioning
profile must authorize each target Mac. Keep the signing key under human
control. Code requirements scoped to the signing team cannot protect against
an actor able to sign new binaries with that team's identity. The local flavor
does not authorize vendor Isotope execution or adapt its installation paths.

Secret Authorization and Availability are unchanged. iPhone Approval requires
a companion that can join the separate Ignis Approval group, which this Mac
flavor does not provide. The build therefore does not establish locked phone
intake or iCloud delivery. Verify locked-session runtime policy and custody
separately on each Mac before using operational Values.
