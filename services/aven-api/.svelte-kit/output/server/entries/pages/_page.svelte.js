import { b as attr, i as head, n as derived, x as escape_html } from "../../chunks/server2.js";
import { t as appRuntime } from "../../chunks/runtime.production.js";
import { t as page } from "../../chunks/state.js";
import "../../chunks/navigation.js";
import { n as tierFrom, t as greetingFor } from "../../chunks/tiers.js";
//#region src/routes/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const initial = appRuntime.initial.nameSearch(page.url);
		let name = initial.name;
		let busy = initial.busy;
		let result = initial.result;
		let error = initial.error;
		/**
		* What the server will actually look up. Typing "Maia Andert!" asks about
		* `maia-andert`, so the field shows one thing and the check is honest about
		* the other — and the line under the input shows which.
		*/
		const slug = derived(() => name.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 32));
		initial.result && initial.name;
		const tier = derived(() => tierFrom(page.url));
		const greeting = derived(() => greetingFor(tier()));
		head("1uha8ag", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>avenID sichern · avenCEO</title>`);
			});
		});
		$$renderer.push(`<section class="panel auth"><img src="/aven-logo.svg" alt="" class="mark" width="56" height="56"/> <h1>Sichere dir deine avenID</h1> `);
		if (greeting()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="eyebrow">Warteliste · ${escape_html(greeting().name)}</p> <p>${escape_html(greeting().lead)}</p>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<p>Wie eine Domain — aber für deinen Aven. Jeden Namen gibt es genau einmal.</p>`);
		}
		$$renderer.push(`<!--]--> <p class="fine">Wir sind noch in der Early Alpha — avenMAIA und avenTIN laufen gerade auf uns selbst: echte
		Posteingänge, echte Dokumente, echter Alltag. Wir schleifen, bis wir sagen können: das gibt dir
		nachweislich Zeit zurück.</p> <form><label>Dein Name<input${attr("value", name)} maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="maia"/></label> <p class="status" aria-live="polite">`);
		if (slug().length === 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<span class="fine">Wie eine Domain — dein Name, einmalig vergeben.</span>`);
		} else if (slug().length < 3) {
			$$renderer.push("<!--[1-->");
			$$renderer.push(`<span class="fine">Noch ${escape_html(3 - slug().length)} Zeichen …</span>`);
		} else if (busy) {
			$$renderer.push("<!--[2-->");
			$$renderer.push(`<span class="fine">${escape_html(slug())}.aven.ceo wird geprüft …</span>`);
		} else if (error) {
			$$renderer.push("<!--[3-->");
			$$renderer.push(`<span class="taken">${escape_html(error)}</span>`);
		} else if (result?.available) {
			$$renderer.push("<!--[4-->");
			$$renderer.push(`<span class="free">✓ ${escape_html(result.name)}.aven.ceo ist frei</span>`);
		} else if (result) {
			$$renderer.push("<!--[5-->");
			$$renderer.push(`<span class="taken">✕ ${escape_html(result.name)}.aven.ceo ist schon vergeben</span>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<span class="fine">${escape_html(slug())}.aven.ceo</span>`);
		}
		$$renderer.push(`<!--]--></p> `);
		if (result?.available) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p>${escape_html(result.priceEur)} € einmalig, zzgl. USt.</p> <button type="submit">Weiter</button>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></form></section>`);
	});
}
//#endregion
export { _page as default };
