import "../../../../chunks/internal.js";
import { b as attr, i as head, x as escape_html } from "../../../../chunks/server2.js";
import { t as appRuntime } from "../../../../chunks/runtime.production.js";
import { t as page } from "../../../../chunks/state.js";
import "../../../../chunks/navigation.js";
//#region src/routes/passkey/create/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const initial = appRuntime.initial.passkey(page.url);
		let name = initial.name;
		let busy = initial.busy;
		let error = initial.error;
		head("e4zxna", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Passkey anlegen · avenCEO</title>`);
			});
		});
		$$renderer.push(`<section class="panel auth"><img src="/aven-logo.svg" alt="" class="mark" width="56" height="56"/> <h1>Passkey anlegen</h1> <p>Ein Passkey ersetzt dein Passwort — er bleibt auf deinem Gerät.</p> <div class="code"><p class="eyebrow">Passkey für</p> <p class="digits">${escape_html(name || "…")}</p></div> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		if (error) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="alert">${escape_html(error)}</div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <button${attr("disabled", busy, true)}>${escape_html(busy ? "Einen Moment …" : "Passkey anlegen")}</button></section>`);
	});
}
//#endregion
export { _page as default };
