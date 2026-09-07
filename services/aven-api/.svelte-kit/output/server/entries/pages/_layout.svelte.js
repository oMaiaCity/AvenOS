import { n as derived, o as store_get, s as unsubscribe_stores } from "../../chunks/server2.js";
import { t as appRuntime } from "../../chunks/runtime.production.js";
import { t as page } from "../../chunks/state.js";
import "../../chunks/navigation.js";
//#endregion
//#region src/routes/+layout.svelte
function _layout($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		var $$store_subs;
		let { children } = $$props;
		const session = derived(() => appRuntime.session(page.url));
		$$renderer.push(`<!----> <header class="site"><a href="/" class="brand"><img src="/aven-logo.svg" alt=""/> <span>avenCEO</span></a> <nav>`);
		if (store_get($$store_subs ??= {}, "$session", session()).authenticated) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<a href="/dashboard">Dashboard</a> <button class="link">Abmelden</button>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<a href="/login">Anmelden</a>`);
		}
		$$renderer.push(`<!--]--></nav></header> <main class="site">`);
		children($$renderer);
		$$renderer.push(`<!----></main>`);
		if ($$store_subs) unsubscribe_stores($$store_subs);
	});
}
//#endregion
export { _layout as default };
