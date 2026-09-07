import "../../../chunks/internal.js";
import { b as attr, i as head, n as derived, r as ensure_array_like, t as attr_class, x as escape_html } from "../../../chunks/server2.js";
import { t as appRuntime } from "../../../chunks/runtime.production.js";
import { t as page } from "../../../chunks/state.js";
import { n as tierFrom, t as greetingFor } from "../../../chunks/tiers.js";
//#region src/routes/secure/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const initial = appRuntime.initial.secureName(page.url);
		let name = initial.name;
		let email = initial.email;
		let info = initial.info;
		let hold = initial.hold;
		initial.loading;
		let error = initial.error;
		const tier = derived(() => tierFrom(page.url));
		const greeting = derived(() => greetingFor(tier()));
		/**
		* One question per screen, the way the old waitlist asked them.
		*
		* A single form with four fields reads as paperwork; asked one at a time the
		* same questions read as a conversation, and each answer is a small
		* commitment that makes the next one likelier. The name was step 1 on the
		* page before this, so the counter starts at 2 and the bar shows all four.
		*/
		const TOTAL_STEPS = 4;
		let step = 1;
		const emailOk = derived(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()));
		head("1h5d7cu", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>avenID sichern · avenCEO</title>`);
			});
		});
		if (hold) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<section class="panel auth"><img src="/aven-logo.svg" alt="" class="mark" width="56" height="56"/> <h1>Du bist auf der Liste</h1> <div class="code"><p class="eyebrow">Reserviert</p> <p class="digits">${escape_html(hold.name)}.aven.ceo</p></div> <p>Wir haben dir den Link an <strong>${escape_html(email)}</strong> geschickt. Er gilt bis
			${escape_html(new Date(hold.expiresAt).toLocaleString("de-DE"))}.</p> <p class="fine">Wir melden uns per Mail, sobald du dran bist — und sonst nicht.</p></section>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<section class="panel auth"><img src="/aven-logo.svg" alt="" class="mark" width="56" height="56"/> <h1>${escape_html(greeting() ? `${greeting().name} sichern` : "avenID sichern")}</h1> <div class="code"><p class="eyebrow">Dein Name</p> <p class="digits">${escape_html(name)}.aven.ceo</p></div> <p>${escape_html(info?.priceEur ?? 30)} € einmalig, zzgl. USt.</p> `);
			if (info && !info.available) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<div class="alert">Dieser Name ist nicht mehr frei. <a href="/">Anderen wählen</a></div>`);
			} else {
				$$renderer.push("<!--[-1-->");
				$$renderer.push(`<div class="steps" aria-hidden="true"><!--[-->`);
				const each_array = ensure_array_like(Array(TOTAL_STEPS));
				for (let i = 0, $$length = each_array.length; i < $$length; i++) {
					each_array[i];
					$$renderer.push(`<span${attr_class(`step ${i <= step ? "done" : ""}`)}></span>`);
				}
				$$renderer.push(`<!--]--></div> <p class="eyebrow">Schritt ${escape_html(2)} von 4</p> <div class="field">`);
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<label>E‑Mail<input${attr("value", email)} type="email" autocomplete="email" placeholder="du@beispiel.de"/></label> <p class="fine">Hierhin schicken wir deinen Link — und sonst nichts.</p>`);
				$$renderer.push(`<!--]--></div> `);
				if (error) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<div class="alert">${escape_html(error)}</div>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--> <div class="actions">`);
				$$renderer.push("<!--[-1-->");
				$$renderer.push(`<a class="ghost" href="/">Anderer Name</a>`);
				$$renderer.push(`<!--]--> `);
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<button type="button"${attr("disabled", !emailOk(), true)}>Weiter</button>`);
				$$renderer.push(`<!--]--></div> <p class="fine">Mit Abschluss erklärst du dich einverstanden, dass wir dich anschreiben, sobald du dran
				bist. Keine Newsletter, kein Weiterverkauf.</p>`);
			}
			$$renderer.push(`<!--]--></section>`);
		}
		$$renderer.push(`<!--]-->`);
	});
}
//#endregion
export { _page as default };
