import { b as attr, i as head, n as derived, x as escape_html } from "../../../../chunks/server2.js";
import { t as appRuntime } from "../../../../chunks/runtime.production.js";
import { t as page } from "../../../../chunks/state.js";
import "../../../../chunks/navigation.js";
//#region src/routes/purchase/fake-checkout/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const initial = appRuntime.initial.payment(page.url);
		let loading = initial.busy;
		let error = initial.error;
		const params = derived(() => ({
			checkoutId: page.url.searchParams.get("checkoutId") ?? "",
			holdId: page.url.searchParams.get("holdId") ?? "",
			name: page.url.searchParams.get("name") ?? "",
			email: page.url.searchParams.get("email") ?? "",
			successUrl: page.url.searchParams.get("successUrl") ?? ""
		}));
		head("1mjm0ut", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Checkout</title>`);
			});
		});
		$$renderer.push(`<section class="panel auth"><h1>Checkout</h1> <p>${escape_html(params().name)} · ${escape_html(params().email)}</p> `);
		if (error) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="alert">${escape_html(error)}</div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <button${attr("disabled", loading || !params().holdId, true)}>${escape_html(loading ? "Processing" : "Pay")}</button></section>`);
	});
}
//#endregion
export { _page as default };
