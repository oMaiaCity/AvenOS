import "../../../../chunks/internal.js";
import { b as attr, i as head, x as escape_html } from "../../../../chunks/server2.js";
import { t as appRuntime } from "../../../../chunks/runtime.production.js";
import { t as page } from "../../../../chunks/state.js";
import "../../../../chunks/navigation.js";
//#region src/routes/purchase/checkout/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data } = $$props;
		const initial = appRuntime.initial.checkout(page.url);
		let checkoutState = initial.state;
		let paymentError = initial.error;
		const fakeParams = (() => {
			if (data.provider !== "fake") return null;
			const url = new URL(data.checkoutUrl);
			return {
				checkoutId: url.searchParams.get("checkoutId") ?? "",
				holdId: url.searchParams.get("holdId") ?? "",
				name: url.searchParams.get("name") ?? "",
				email: url.searchParams.get("email") ?? "",
				successUrl: url.searchParams.get("successUrl") ?? ""
			};
		})();
		head("1gr56jv", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Checkout</title>`);
			});
		});
		$$renderer.push(`<section class="checkout-page svelte-1gr56jv"><p class="checkout-subject svelte-1gr56jv"><span class="svelte-1gr56jv">Du sicherst</span> ${escape_html(data.name)}.aven.ceo</p> <div class="checkout-container svelte-1gr56jv">`);
		if (fakeParams) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="mock-checkout svelte-1gr56jv"><h2>${escape_html(data.name)}</h2> `);
			if (paymentError) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<div class="alert">${escape_html(paymentError)}</div>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--> <button${attr("disabled", checkoutState === "paying", true)} class="svelte-1gr56jv">${escape_html(checkoutState === "paying" ? "Processing" : "Pay")}</button></div>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<p class="checkout-state svelte-1gr56jv" aria-live="polite">${escape_html(checkoutState === "confirming" ? "Confirming" : checkoutState === "ready" ? "Ready" : "Loading")}</p> <iframe${attr("src", data.checkoutUrl)}${attr("title", `Checkout for ${data.name}`)} allow="payment *; publickey-credentials-get *" referrerpolicy="same-origin" class="svelte-1gr56jv"></iframe>`);
		}
		$$renderer.push(`<!--]--></div></section>`);
	});
}
//#endregion
export { _page as default };
