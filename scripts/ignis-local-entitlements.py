"""Emit the minimal Mac entitlements authorized by the Ignis development profile."""

import datetime
import hashlib
import plistlib
import sys


TEAM = "8G29DNN4U4"
APP_ID = f"{TEAM}.com.ignislabs.automicvault"
GROUPS = [APP_ID, f"{APP_ID}.approval"]


def entitlements(profile, identity, now):
    allowed = profile["Entitlements"]
    if (
        profile.get("TeamIdentifier") != [TEAM]
        or "OSX" not in profile.get("Platform", [])
        or not profile.get("ProvisionedDevices")
        or profile.get("ProvisionsAllDevices", False)
        or profile["ExpirationDate"].replace(tzinfo=datetime.timezone.utc) <= now
        or allowed.get("com.apple.application-identifier") != APP_ID
        or allowed.get("com.apple.developer.team-identifier") != TEAM
        or f"{TEAM}.*" not in allowed.get("keychain-access-groups", [])
        or not any(
            hashlib.sha1(cert).hexdigest().upper() == identity
            for cert in profile.get("DeveloperCertificates", [])
        )
    ):
        raise ValueError("profile does not authorize the Ignis development app and signing identity")
    return {
        "com.apple.application-identifier": APP_ID,
        "com.apple.developer.team-identifier": TEAM,
        "keychain-access-groups": GROUPS,
    }


if __name__ == "__main__":
    try:
        profile = plistlib.loads(sys.stdin.buffer.read())
        signed = entitlements(profile, sys.argv[1], datetime.datetime.now(datetime.timezone.utc))
        sys.stdout.buffer.write(plistlib.dumps(signed))
    except (KeyError, ValueError, plistlib.InvalidFileException) as error:
        sys.exit(f"error: {error}")
