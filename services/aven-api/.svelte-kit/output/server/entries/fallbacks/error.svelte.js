import { x as escape_html } from "../../chunks/server2.js";
import { t as page } from "../../chunks/state.js";
//#region ../../node_modules/.bun/@sveltejs+kit@2.69.3+ec5538ac9f1e1d4a/node_modules/@sveltejs/kit/src/runtime/components/svelte-5/error.svelte
function Error($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		$$renderer.push(`<h1>${escape_html(page.status)}</h1> <p>${escape_html(page.error?.message)}</p>`);
	});
}
//#endregion
export { Error as default };
