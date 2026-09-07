import { i as head } from "../../../../chunks/server2.js";
//#region src/routes/purchase/expired/+page.svelte
function _page($$renderer) {
	head("1si2s42", $$renderer, ($$renderer) => {
		$$renderer.title(($$renderer) => {
			$$renderer.push(`<title>Checkout link expired</title>`);
		});
	});
	$$renderer.push(`<section class="panel"><h1>Checkout link expired</h1> <a href="/"><button>Back</button></a></section>`);
}
//#endregion
export { _page as default };
