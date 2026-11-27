#!/bin/bash
set -euo pipefail

: "${IGNIS_VAULT_IOS_APP_PROFILE:?Set the path to the Ignis iOS app provisioning profile}"
: "${IGNIS_VAULT_IOS_NOTIFICATION_PROFILE:?Set the path to the Ignis iOS notification extension provisioning profile}"
: "${IGNIS_VAULT_SIGNING_IDENTITY:?Set the Apple signing certificate fingerprint}"

if [[ $# -ne 1 || "$1" != /* || -e "$1" ]]; then
    echo 'Usage: scripts/build-ignis-ios.sh <archive-path>' >&2
    exit 2
fi

if [[ ! "$IGNIS_VAULT_SIGNING_IDENTITY" =~ ^[[:xdigit:]]{40}$ ]]; then
    echo 'The signing identity must be a SHA-1 certificate fingerprint.' >&2
    exit 2
fi

profile_directory="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
mkdir -p "$profile_directory"

install_profile() {
    local profile="$1"
    local bundle="$2"
    local payload uuid destination
    local aps_environment="${3:-}"

    payload="$(security cms -D -i "$profile")"
    if [[ "$(plutil -extract Entitlements.application-identifier raw -o - - <<<"$payload")" != "8G29DNN4U4.$bundle" ]]; then
        echo "An Ignis profile for $bundle is required." >&2
        return 1
    fi
    if [[ -n "$aps_environment" &&
          "$(plutil -extract Entitlements.aps-environment raw -o - - <<<"$payload")" != "$aps_environment" ]]; then
        echo "The provisioning profile for $bundle must allow $aps_environment push." >&2
        return 1
    fi
    uuid="$(plutil -extract UUID raw -o - - <<<"$payload")"
    if [[ ! "$uuid" =~ ^[[:xdigit:]]{8}(-[[:xdigit:]]{4}){3}-[[:xdigit:]]{12}$ ]]; then
        echo "The provisioning profile for $bundle has an invalid UUID." >&2
        return 1
    fi
    destination="$profile_directory/$uuid.mobileprovision"
    if [[ -e "$destination" ]]; then
        if ! cmp -s "$profile" "$destination"; then
            echo "An installed profile for $bundle has the same UUID and different contents." >&2
            return 1
        fi
    else
        (umask 077; set -o noclobber; cat "$profile" > "$destination")
    fi
    printf '%s\n' "$uuid"
}

aps_environment="${IGNIS_VAULT_IOS_APS_ENVIRONMENT:-development}"
case "$aps_environment" in
    development|production) ;;
    *) echo 'Set IGNIS_VAULT_IOS_APS_ENVIRONMENT to development or production.' >&2; exit 2 ;;
esac

app_profile_uuid="$(install_profile "$IGNIS_VAULT_IOS_APP_PROFILE" com.ignislabs.automicvault.approval "$aps_environment")"
notification_profile_uuid="$(install_profile "$IGNIS_VAULT_IOS_NOTIFICATION_PROFILE" com.ignislabs.automicvault.approval.notifications)"

project="$(cd "$(dirname "$0")/../src/ios/ApprovalApp" && pwd)/AutomicVaultApproval.xcodeproj"
exec xcodebuild -project "$project" -scheme AutomicVaultApproval \
    -configuration IgnisLocal -destination 'generic/platform=iOS' \
    -derivedDataPath "$(dirname "$1")/DerivedData" \
    -archivePath "$1" \
    "APS_ENVIRONMENT=$aps_environment" \
    "IGNIS_VAULT_SIGNING_IDENTITY=$IGNIS_VAULT_SIGNING_IDENTITY" \
    "IGNIS_VAULT_IOS_APP_PROFILE_UUID=$app_profile_uuid" \
    "IGNIS_VAULT_IOS_NOTIFICATION_PROFILE_UUID=$notification_profile_uuid" \
    archive
