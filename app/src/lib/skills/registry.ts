import {
	CATALOG,
	skillById as catalogEntry,
	reconcile,
	type SkillEntry
} from '@myavenceo/aven-ceo/skills'
import { inboxSkill } from './inbox.skill'
import { abgleichSkill, brainSkill, calendarSkill, docsSkill } from './mocked.skills'
import type { SkillDef } from './skill'
import { todosSkill } from './todos.skill'

/**
 * The skills this app IMPLEMENTS — workflows, nodes, views. What a skill IS
 * (its name, its one-liner, the tier it comes with) lives in the shared
 * catalog, `@myavenceo/aven-ceo/skills`, which the marketing site reads from too.
 *
 * The split is deliberate: the app should not restate a display name the
 * website also owns, and the website should not carry workflow graphs. Two
 * facets, one identity. `libs/aven-skills/tests` fails if either side drifts.
 */
const implemented: SkillDef[] = [
	todosSkill,
	inboxSkill,
	docsSkill,
	calendarSkill,
	brainSkill,
	abgleichSkill
]

/**
 * The catalog names win. Each definition still declares a `name` — the type
 * wants one and the file should read on its own — but what the app SHOWS is
 * what the marketplace shows: "Email Manager", not "Inbox". Overriding here,
 * once, is what stops the two from drifting; doing it at each render site
 * would just be the old duplication with extra steps.
 */
export const skills: SkillDef[] = implemented.map((s) => {
	const entry = catalogEntry(s.id)
	return entry ? { ...s, name: entry.name } : s
})

/** Template lookup by id — the intents workspace resolves instances here. */
export function skillById(id: string): SkillDef | undefined {
	return skills.find((s) => s.id === id)
}

/** The public name of a skill, for the places that only hold its id. */
export function nameOf(id: string): string {
	return catalogEntry(id)?.name ?? id
}

/** What the shared catalog says about a skill: its name, tagline and tier. */
export function identityOf(id: string): SkillEntry | undefined {
	return catalogEntry(id)
}

/**
 * How this app's implementations line up against the catalog — `unknown` names
 * skills implemented here that the catalog has never heard of, `missing` names
 * catalog entries with no workflow yet (today: the announced ones, plus the
 * two the website sells that have no runtime).
 */
export function catalogCoverage() {
	return reconcile(implemented.map((s) => s.id))
}

export { CATALOG }
