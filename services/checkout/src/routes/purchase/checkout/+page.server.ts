import { serverBuildRuntime } from 'virtual:aven-server-build-runtime'
import type { PageServerLoad } from './$types.js'

// The emailed token is the sole credential for this page. Resolving it proves
// inbox control, starts the short reservation, and lazily creates one checkout
// session. The provider URL is safe to expose in the browser, but never appears
// in the email or the public hold API.
export const load: PageServerLoad = (event) => serverBuildRuntime.loadCheckout(event)
