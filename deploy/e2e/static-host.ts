// Keep the fixture socket and host in one lifetime; a detached background DNS
// child must not disappear while the production host keeps reporting timeouts.
import { ready } from './dns-mock.js'
await ready
const entrypoint = '/app/src/index.ts'
await import(entrypoint)
