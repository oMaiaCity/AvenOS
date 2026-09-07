/**
 * Conventional-commits gate. Versions are CalVer (date-driven, see scripts/next-version.ts),
 * so commit types no longer pick the version — but they still drive a clean, grouped
 * CHANGELOG.md, so we enforce the convention on promoted commit ranges.
 *
 * Subject case is intentionally unrestricted. Commit subjects contain proper nouns,
 * product names, and German nouns whose required capitalization the generic case rule
 * cannot distinguish from sentence or start case.
 */
module.exports = {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'subject-case': [0]
	}
}
