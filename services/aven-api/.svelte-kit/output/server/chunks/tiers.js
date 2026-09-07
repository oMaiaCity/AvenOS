//#region src/lib/tiers.ts
var TIER_IDS = [
	"avenid",
	"avenme",
	"avenceo",
	"avencoop"
];
var GREETINGS = {
	avenid: {
		name: "avenID",
		lead: "Deine avenID ist der Name, unter dem dein Aven erreichbar ist — und zugleich dein Platz auf der Warteliste. Eingeladen wird der Reihe nach."
	},
	avenme: {
		name: "avenME",
		lead: "avenME startet invite‑only. Deinen Platz sicherst du dir über deine avenID: Der Name gehört dir, und die Reihenfolge der Warteliste ist die Reihenfolge der Einladungen."
	},
	avenceo: {
		name: "avenCEO",
		lead: "avenCEO startet invite‑only. Deinen Platz sicherst du dir über deine avenID: Der Name gehört dir, und die Reihenfolge der Warteliste ist die Reihenfolge der Einladungen."
	},
	avencoop: {
		name: "avenCOOP",
		lead: "avenCOOP vergeben wir nach Passung, nicht der Reihe nach — wir steigen als technischer Co‑Founder bei dir ein. Der Weg dahin führt trotzdem über deine avenID: Sie hält deinen Platz und zeigt uns, dass es dir ernst ist."
	}
};
function tierFrom(url) {
	const raw = url.searchParams.get("tier");
	return TIER_IDS.includes(raw) ? raw : null;
}
function greetingFor(tier) {
	return tier ? GREETINGS[tier] : null;
}
//#endregion
export { tierFrom as n, greetingFor as t };
