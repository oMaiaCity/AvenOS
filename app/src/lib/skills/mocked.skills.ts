import type { SkillDef } from './skill'

/**
 * The remaining skills of the epic (0152), DECLARED as minimal templates so
 * the intents workspace and the Skills viewer speak about the SAME flows —
 * template and instance in sync. Full workflows/views land with their own
 * cards (0154/0155); until then each carries its one canonical workflow.
 */

export const docsSkill: SkillDef = {
	id: 'docs',
	name: 'Docs',
	about: 'Dokumente: ablegen, finden, Antworten entwerfen — Freigabe bleibt beim Menschen.',
	tags: ['docs'],
	workflows: [
		{
			id: 'ingest',
			name: 'Ingest',
			about:
				'Client actors inspect, decompose, read and classify a document; every hop is an artifact run.',
			nodes: [
				{
					id: 'inspect',
					kind: 'trigger',
					name: 'Inspect',
					about: 'Detect the exact bytes and open a bounded document locally.',
					type: 'op:client-inspect',
					requires: ['file(F)'],
					provides: ['file_inspection(F, I)'],
					live: true
				},
				{
					id: 'decompose',
					kind: 'op',
					name: 'Pages',
					about: 'Create one stable logical artifact for every page.',
					type: 'op:client-decompose',
					requires: ['file(F)', 'file_inspection(F, I)'],
					provides: ['page(F, P)'],
					live: true
				},
				{
					id: 'extract-native',
					kind: 'op',
					name: 'Native text',
					about: 'Read embedded text and its normalized layout with pdf.js.',
					type: 'op:client-native-text',
					requires: ['file(F)', 'page(F, P)'],
					provides: ['extracted_text(F, P, T)', 'text_layout(F, P, L)'],
					live: true
				},
				{
					id: 'classify-page',
					kind: 'op',
					name: 'Page signals',
					about: 'Classify only what media and native text prove; missing OCR stays unknown.',
					type: 'op:client-classify',
					requires: ['extracted_text(F, P, T)'],
					provides: ['content_classification(P, C)'],
					live: true
				},
				{
					id: 'assemble',
					kind: 'op',
					name: 'Assemble',
					about: 'Combine bounded page representations into document text and layout.',
					type: 'op:client-assemble',
					requires: ['extracted_text(F, P, T)'],
					provides: ['document_text(F, T)', 'document_layout(F, L)'],
					live: true
				},
				{
					id: 'aggregate',
					kind: 'output',
					name: 'Document',
					about:
						'Publish the honest whole-document classification and expose missing capabilities.',
					type: 'op:client-aggregate',
					requires: ['content_classification(P, C)', 'document_text(F, T)'],
					provides: ['content_classification(F, C)'],
					live: true
				}
			]
		},
		{
			id: 'respond',
			name: 'Bearbeiten',
			about: 'Eine Anforderung wird zum Entwurf; freigegeben wird von Hand.',
			nodes: [
				{
					id: 'request-trigger',
					kind: 'trigger',
					name: 'Anforderung',
					about: 'Ein Intent verlangt ein Dokument — Antwort, Ablage oder Suche.',
					type: 'trigger:request',
					provides: ['doc_request(R)']
				},
				{
					id: 'draft',
					kind: 'op',
					name: 'Entwurf',
					about: 'Das Schreiben wird aufgesetzt, aus Artefakten und Kontext.',
					type: 'llm:draft',
					requires: ['doc_request(R)'],
					provides: ['draft(D)']
				},
				{
					id: 'approve',
					kind: 'op',
					name: 'Freigabe',
					about: 'HITL: nur ein Knopfdruck lässt den Entwurf hinaus.',
					type: 'human:approve',
					requires: ['draft(D)'],
					provides: ['approved(D)']
				},
				{
					id: 'finish',
					kind: 'output',
					name: 'Erledigt',
					about: 'Versendet bzw. abgelegt — und archiviert.',
					type: 'op:finish',
					requires: ['approved(D)'],
					provides: ['doc(D)']
				}
			]
		}
	]
}

export const calendarSkill: SkillDef = {
	id: 'calendar',
	name: 'Calendar',
	about: 'Termine und Fristen — aus Todos mit Datum, mit Erinnerung vor dem Ende.',
	tags: ['calendar'],
	workflows: [
		{
			id: 'frist',
			name: 'Frist',
			about: 'Ein Datum wird Termin, erinnert, und läuft ab.',
			nodes: [
				{
					id: 'date-trigger',
					kind: 'trigger',
					name: 'Datum erkannt',
					about: 'Ein Todo oder Intent trägt ein Datum oder eine Frist.',
					type: 'trigger:date',
					provides: ['date_intent(D)']
				},
				{
					id: 'schedule',
					kind: 'op',
					name: 'Eintragen',
					about: 'Der Termin landet im Kalender.',
					type: 'op:schedule',
					requires: ['date_intent(D)'],
					provides: ['event(E, Time)']
				},
				{
					id: 'remind',
					kind: 'op',
					name: 'Erinnern',
					about: 'Rechtzeitig vor der Frist meldet sich der Kalender.',
					type: 'op:remind',
					requires: ['event(E, Time)'],
					provides: ['reminder(R)']
				},
				{
					id: 'due',
					kind: 'output',
					name: 'Frist',
					about: 'Der Tag selbst — erledigt oder eskaliert.',
					type: 'view:due',
					requires: ['reminder(R)'],
					provides: ['due(E)']
				}
			]
		}
	]
}

export const brainSkill: SkillDef = {
	id: 'brain',
	name: 'Brain',
	about:
		'Das Gedächtnis: Entitäten jeder Art — Todos, Menschen, Firmen zuerst — als Wikilinks verknüpft und angereichert.',
	tags: ['brain'],
	workflows: [
		{
			id: 'verknuepfen',
			name: 'Verknüpfen',
			about: 'Eine Entität wird erkannt, verlinkt, angereichert.',
			nodes: [
				{
					id: 'entity-trigger',
					kind: 'trigger',
					name: 'Entität',
					about: 'Aus jedem Artefakt fallen Entitäten: Personen, Firmen, Konzepte.',
					type: 'trigger:entity',
					provides: ['entity(E)']
				},
				{
					id: 'resolve',
					kind: 'op',
					name: 'Erkennen',
					about: 'Dublette oder neu? Eine Entität existiert genau einmal.',
					type: 'op:resolve',
					requires: ['entity(E)'],
					provides: ['resolved(E)']
				},
				{
					id: 'link',
					kind: 'op',
					name: 'Verknüpfen',
					about: 'Wikilinks in beide Richtungen — das Netz wächst.',
					type: 'op:link',
					requires: ['resolved(E)'],
					provides: ['linked(E)']
				},
				{
					id: 'enrich',
					kind: 'output',
					name: 'Anreichern',
					about: 'Muster und Konzepte über den Verknüpfungen.',
					type: 'llm:enrich',
					requires: ['linked(E)'],
					provides: ['enriched(E)']
				}
			]
		}
	]
}

export const abgleichSkill: SkillDef = {
	id: 'abgleich',
	name: 'Abgleich',
	about: 'Kontoauszüge gegen offene Posten: Zahlungen finden ihre Rechnungen.',
	tags: ['abgleich'],
	workflows: [
		{
			id: 'match',
			name: 'Abgleichen',
			about: 'Transaktionen rein, Zuordnungen raus, Todos abgehakt.',
			nodes: [
				{
					id: 'statement-trigger',
					kind: 'trigger',
					name: 'Kontoauszug',
					about: 'CSV oder Feed — die Transaktionen des Zeitraums.',
					type: 'trigger:statement',
					provides: ['statement(S)']
				},
				{
					id: 'match',
					kind: 'op',
					name: 'Zuordnen',
					about: 'Jede Zahlung sucht ihre Rechnung; das Unklare fragt nach.',
					type: 'llm:match',
					requires: ['statement(S)'],
					provides: ['matched(M)']
				},
				{
					id: 'tick',
					kind: 'output',
					name: 'Abhaken',
					about: 'Bezahlte Todos gehen auf erledigt.',
					type: 'op:tick',
					requires: ['matched(M)'],
					provides: ['ticked(T)']
				}
			]
		}
	]
}
