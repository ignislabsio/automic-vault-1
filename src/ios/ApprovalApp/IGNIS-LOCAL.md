# Ignis Vault for iPhone and iPad

The `IgnisLocal` configuration builds the private iPhone Approval companion
for [Ignis local development custody](../../../docs/adr/0086-ignis-local-development-custody.md).
It uses the Ignis Apple development team, a separate iCloud Keychain Approval
group, and the Ignis Approval relay over HTTPS on the private tailnet. The
companion supports sandbox APNs for development and production APNs for ad hoc distribution. The Ignis development build is eligible for iPhone
Approval without a StoreKit subscription. Each allow response still requires
an explicit human Approval and the configured local biometric authentication.
The Mac still enforces the Authorization Decision for the exact request.

From the repository root, set `IGNIS_VAULT_IOS_APP_PROFILE` and
`IGNIS_VAULT_IOS_NOTIFICATION_PROFILE` to the paths of the respective
device provisioning profiles. Set `IGNIS_VAULT_SIGNING_IDENTITY` to the
matching installed Apple signing certificate's SHA-1 fingerprint, then run:

```sh
scripts/build-ignis-ios.sh /path/to/IgnisVault.xcarchive
```

For ad hoc distribution, set `IGNIS_VAULT_IOS_APS_ENVIRONMENT=production` and use
the app and extension's ad hoc profiles and matching Apple Distribution
certificate. The default environment is `development`.

The script registers both profiles with Xcode and produces a device archive.
The app and extension need profiles for
`com.ignislabs.automicvault.approval` and
`com.ignislabs.automicvault.approval.notifications` respectively. Both
profiles must allow the shared Keychain group
`8G29DNN4U4.com.ignislabs.automicvault.approval` and cover the target device.
The app profile also needs the push entitlement matching the selected environment.

Use an iPhone or iPad enrolled in the private tailnet and signed in to the
same iCloud Keychain account as the Ignis Mac. Verify device registration,
push receipt, and the Mac's recorded Approval before relying on the build for
a locked-session operation.
