import "../../../../chunks/internal.js";
import { i as head, n as derived, x as escape_html } from "../../../../chunks/server2.js";
import "../../../../chunks/runtime.production.js";
import { t as page } from "../../../../chunks/state.js";
//#region src/routes/purchase/success/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const name = derived(() => page.url.searchParams.get("name") ?? "");
		head("aahoks", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Payment complete</title>`);
			});
		});
		$$renderer.push(`<section class="panel"><h1>Payment complete</h1> `);
		if (name()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p>${escape_html(name())}</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		$$renderer.push("<!--[0-->");
		$$renderer.push(`<p>Confirming</p>`);
		$$renderer.push(`<!--]--></section>`);
	});
}
//#endregion
export { _page as default };
