import copy
import datetime
import hashlib
import runpy
import unittest
from pathlib import Path


module = runpy.run_path(Path(__file__).with_name("ignis-local-entitlements.py"))
derive = module["entitlements"]


class IgnisLocalEntitlementsTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.datetime(2026, 11, 27, tzinfo=datetime.timezone.utc)
        cert = b"synthetic Apple Development certificate"
        self.identity = hashlib.sha1(cert).hexdigest().upper()
        self.profile = {
            "TeamIdentifier": ["8G29DNN4U4"],
            "Platform": ["OSX"],
            "ProvisionedDevices": ["registered-mac"],
            "ExpirationDate": datetime.datetime(2027, 11, 27),
            "DeveloperCertificates": [cert],
            "Entitlements": {
                "com.apple.application-identifier": "8G29DNN4U4.com.ignislabs.automicvault",
                "com.apple.developer.team-identifier": "8G29DNN4U4",
                "keychain-access-groups": ["8G29DNN4U4.*"],
                "com.apple.security.get-task-allow": True,
            },
        }

    def test_emits_only_the_two_ignis_groups_and_application_identity(self):
        self.assertEqual(
            derive(self.profile, self.identity, self.now),
            {
                "com.apple.application-identifier": "8G29DNN4U4.com.ignislabs.automicvault",
                "com.apple.developer.team-identifier": "8G29DNN4U4",
                "keychain-access-groups": [
                    "8G29DNN4U4.com.ignislabs.automicvault",
                    "8G29DNN4U4.com.ignislabs.automicvault.approval",
                ],
            },
        )

    def test_rejects_expired_distribution_and_vendor_profiles(self):
        for changes in (
            {"ExpirationDate": datetime.datetime(2026, 11, 26)},
            {"ProvisionsAllDevices": True},
            {"ProvisionedDevices": []},
            {"TeamIdentifier": ["ZU76A67LGU"]},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                derive(self.profile | changes, self.identity, self.now)

    def test_rejects_other_signing_certificate_and_bundle(self):
        with self.assertRaises(ValueError):
            derive(self.profile, "0" * 40, self.now)
        profile = copy.deepcopy(self.profile)
        profile["Entitlements"]["com.apple.application-identifier"] = "8G29DNN4U4.com.ignislabs.other"
        with self.assertRaises(ValueError):
            derive(profile, self.identity, self.now)


if __name__ == "__main__":
    unittest.main()
