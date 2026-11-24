// Host services the Capability Gateway may use (experimental). They run in
// the trusted host with the host-derived context; the module never reaches
// them directly. Least privilege: never the user's admin flag, only the
// module permissions the user holds.
export function createGatewayHostServices({ filesService }) {
  return {
    files: {
      async describe({ companyId, profileId, permissionSet, ids }) {
        const assets = await filesService.getCompanyAssets({ activeContext: { companyId, profileId, isAdmin: false, permissionSet }, fileIds: ids })
        return assets.map((asset) => ({ id: asset.id, mimeType: asset.mimeType }))
      },
    },
  }
}
