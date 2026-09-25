// Advertised methods indicate shell support, not the iframe's granted permissions.
export function canUseInvoiceStorage(ready: boolean, methods: readonly string[] | undefined): boolean {
  return ready && !!methods?.includes('storage.readJson') && methods.includes('storage.writeJson')
}

// The ready handshake has no permission list. A session may still use the previous
// manifest grants while an updated app declares filesystem access.
export function isInvoiceStoragePermissionUnavailable(error: unknown): boolean {
  return error instanceof Error &&
    error.message === 'Missing permission "filesystem" for bridge method "storage.readJson"'
}
