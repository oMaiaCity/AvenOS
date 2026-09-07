// The production forced-command dispatcher invokes narrowly scoped operations here.
export {}

// Product provisioning itself has no HTTP endpoint and is driven only by control rows.
if (process.argv[2] === 'catalog') {
	const { catalogDigest, loadCatalog } = await import('./catalog.js')
	const catalog = await loadCatalog()
	console.log(JSON.stringify({ digest: catalogDigest(catalog), components: [...catalog.keys()] }))
} else {
	console.error('unsupported platform provisioner operation')
	process.exit(2)
}
