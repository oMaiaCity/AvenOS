import "../../../chunks/internal.js";
import { i as head } from "../../../chunks/server2.js";
import "../../../chunks/runtime.production.js";
import "../../../chunks/state.js";
import "../../../chunks/navigation.js";
//#region src/routes/dashboard/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		head("x1i5gj", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Deine Warteliste · avenCEO</title>`);
			});
		});
		$$renderer.push(`<section class="panel auth spread">`);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<img src="/aven-logo.svg" alt="" class="mark" width="56" height="56"/> <h1>Dein avenOS</h1>`);
		$$renderer.push(`<!--]--></section>`);
	});
}
//#endregion
export { _page as default };
