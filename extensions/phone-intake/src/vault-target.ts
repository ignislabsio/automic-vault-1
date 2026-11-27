// Each mode pins one installed application and publisher. A request cannot
// supply a path or change the trusted signer through its environment or body.
export function vaultTarget(ignisLocal: boolean) {
  return ignisLocal ? {
    executable: "/Applications/Ignis Automic Vault.app/Contents/MacOS/av",
    requirement: '=anchor apple generic and identifier "com.automicvault.av" and certificate leaf[subject.OU] = "8G29DNN4U4"',
  } : {
    executable: "/Applications/Automic Vault.app/Contents/MacOS/av",
    requirement: '=anchor apple generic and identifier "com.automicvault.av" and certificate leaf[subject.OU] = "ZU76A67LGU"',
  };
}
