import { b as attr, i as head, x as escape_html } from "../../../chunks/server2.js";
import { t as appRuntime } from "../../../chunks/runtime.production.js";
import { t as page } from "../../../chunks/state.js";
import "../../../chunks/navigation.js";
//#region src/routes/login/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const initial = appRuntime.initial.login(page.url);
		let busy = initial.busy;
		let message = initial.message;
		head("1x05zx6", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Anmelden · avenCEO</title>`);
			});
		});
		$$renderer.push(`<section class="panel auth"><img src="/aven-logo.svg" alt="" class="mark" width="56" height="56"/> <h1>Willkommen zurück</h1> `);
		if (message) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="alert">${escape_html(message)}</div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <p>Melde dich mit dem Passkey deines Aven‑Kontos an.</p> <button${attr("disabled", busy, true)}>${escape_html(busy ? "Einen Moment …" : "Mit Passkey anmelden")}</button></section>`);
	});
}
//#endregion
export { _page as default };
