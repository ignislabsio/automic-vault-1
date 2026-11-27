enum ApprovalAppBrand {
    #if IGNIS_VAULT_LOCAL
    static let name = "Ignis Vault"
    #else
    static let name = "Automic Vault"
    #endif
}
