import { b as attr, i as head, n as derived, o as store_get, s as unsubscribe_stores, t as attr_class, x as escape_html } from "../../../chunks/server2.js";
import { t as appRuntime } from "../../../chunks/runtime.production.js";
import { t as page } from "../../../chunks/state.js";
//#region src/routes/device/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		var $$store_subs;
		const session = appRuntime.session(page.url);
		const userCode = derived(() => page.url.searchParams.get("user_code")?.replaceAll("-", "") ?? "");
		const displayCode = derived(() => userCode().replace(/(.{4})(?=.)/g, "$1-"));
		const initial = appRuntime.initial.device(page.url);
		let signedIn = initial.signedIn;
		let busy = initial.busy;
		let approved = initial.approved;
		let message = initial.message;
		const authenticated = derived(() => store_get($$store_subs ??= {}, "$session", session).authenticated || signedIn);
		const heading = derived(() => !userCode() ? "Dieser Verbindungslink ist unvollständig" : approved ? "avenOS ist verbunden" : authenticated() ? "Diese avenOS-App verbinden?" : "Anmelden und avenOS verbinden");
		const description = derived(() => !userCode() ? "Öffne den Anmeldelink aus avenOS erneut, um einen neuen Gerätecode zu erhalten." : approved ? "Du kannst diese Seite schließen und zu avenOS zurückkehren." : authenticated() ? "Bestätige die Verbindung, um der App Zugriff auf dein Aven-Konto zu geben." : "Verwende den Passkey deines Aven-Kontos. Im nächsten Schritt bestätigst du die App.");
		head("wy0cvb", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>avenOS verbinden</title>`);
			});
		});
		$$renderer.push(`<section class="device-flow" aria-live="polite"><div${attr_class("device-flow__icon", void 0, {
			"success": approved,
			"error": !userCode() || Boolean(message)
		})}>`);
		if (approved) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.25 4.25L19 7"></path></svg>`);
		} else if (!userCode()) {
			$$renderer.push("<!--[1-->");
			$$renderer.push(`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 17h.01"></path><circle cx="12" cy="12" r="9"></circle></svg>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>`);
		}
		$$renderer.push(`<!--]--></div> <p class="device-flow__eyebrow">Sichere App-Verbindung</p> <h1>${escape_html(heading())}</h1> <p class="device-flow__description">${escape_html(description())}</p> `);
		if (displayCode()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="device-flow__code"><span>Gerätecode</span> <strong>${escape_html(displayCode())}</strong></div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		if (message) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div class="alert" role="alert">${escape_html(message)}</div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		if (userCode() && !approved && authenticated()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<button${attr("disabled", busy || !userCode(), true)}>${escape_html(busy ? "Wird verbunden …" : "avenOS verbinden")}</button>`);
		} else if (userCode() && !approved) {
			$$renderer.push("<!--[1-->");
			$$renderer.push(`<button${attr("disabled", busy || !userCode(), true)}>${escape_html(busy ? "Passkey wird geöffnet …" : "Mit Passkey fortfahren")}</button>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <div class="device-flow__trust"><span></span> Sicher verbunden über id.next.aven.ceo</div></section>`);
		if ($$store_subs) unsubscribe_stores($$store_subs);
	});
}
//#endregion
export { _page as default };
