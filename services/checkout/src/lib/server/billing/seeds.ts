// The products that exist at the provider, straight from the brand's
// pricing SSOT. The tier IS the wire key: it lands in the Polar product's
// `metadata.tier` and is how products are found again — never pinned ids.
import { PLANS, type Plan, plan, planIncludes, planTexts } from '@myavenceo/aven-ceo/pricing'
import type { ProductSeed } from './provider.js'

/** Every provider product: the one-off avenNAME plus the recurring avenCEO
 * tier. avenCOOP is not a product at all — that relationship is handled
 * individually, outside this system. */
export const PRODUCT_TIERS = ['aven-name', 'aven-ceo'] as const
export type ProductTier = (typeof PRODUCT_TIERS)[number]

/** Keep the Polar description comfortably readable on the checkout page —
 * whole bullets only, never a line cut mid-sentence. */
const DESCRIPTION_MAX_CHARS = 1000

/** The product description shown at the provider, as markdown from the SSOT:
 * the German role line, a blank line, then the PLAIN feature bullets — their
 * short titles only. Skill features stay out: they render as visible
 * benefits on the checkout, so the description would double them. German is
 * the authored language — Polar's Localized Checkout translates the checkout
 * chrome, not our copy. Bullets past the length budget are dropped whole. */
function productDescription(p: Plan): string {
	let description = p.role
	let separator = '\n\n'
	for (const feature of p.features) {
		if (feature.skill) continue
		const next = `${description}${separator}- ${feature.title}`
		if (next.length > DESCRIPTION_MAX_CHARS) break
		description = next
		separator = '\n'
	}
	return description
}

export function productSeeds(): ProductSeed[] {
	return PRODUCT_TIERS.map((tier) => {
		// biome-ignore lint/style/noNonNullAssertion: PRODUCT_TIERS ⊂ PLANS ids.
		const plan: Plan = PLANS.find((p) => p.id === tier)!
		return {
			tier,
			name: plan.name,
			description: productDescription(plan),
			// GROSS cents — Polar presents the price tax-INCLUSIVE ("inkl. USt."),
			// so the SSOT number is exactly what the buyer pays.
			priceCents: Math.round(plan.eurPrice * 100),
			interval: plan.billing === 'weekly' ? 'week' : plan.billing === 'monthly' ? 'month' : null
		}
	})
}

// ---------------------------------------------------------------------------
// Benefits — the SSOT's skill features and included runtime as REAL provider
// benefits, attached to the products and VISIBLE on the checkout. Two kinds:
// every `{skill}` feature becomes one feature-flag benefit (shared across
// products via the skill cascade), and the included agent runtime becomes a
// metered (or custom, where meters are gated) benefit per recurring tier.
// Plain bullets do NOT become benefits — they live in the product description.

/** Polar shows a benefit's description on the product — hard cap 42 chars.
 * The SSOT titles are authored under it; this only guards regressions. */
const BENEFIT_DESCRIPTION_MAX = 42

function benefitDescription(text: string): string {
	if (text.length <= BENEFIT_DESCRIPTION_MAX) return text
	return `${text.slice(0, BENEFIT_DESCRIPTION_MAX - 1)}…`
}

/** One benefit to guarantee exists at the provider. The `key` is the wire
 * identity (stored in the benefit's `metadata.key`) — how it is found again,
 * exactly like `metadata.tier` on products. */
export interface BenefitSpec {
	/** `skill:<slug>` | `runtime:<tier>` */
	key: string
	kind: 'feature_flag' | 'runtime'
	/** The short ENGLISH title shown on the product — capped at 42 chars.
	 * English is the benefit default (Samuel, 2026-08-24); localized German
	 * titles live on the website, not at the provider. */
	description: string
	/** runtime kind only — the SSOT numbers the benefit is built from. */
	runtime: { mindCredits: number; per: 'once' | 'week' } | null
}

/** The skill features of ONE plan as feature-flag specs, in feature order —
 * titled in English (index-aligned with the German features). */
function skillFlagSpecs(p: Plan): BenefitSpec[] {
	const english = planTexts(p.id, 'en').features
	return p.features.flatMap((f, index) =>
		f.skill
			? [
					{
						key: `skill:${f.skill}`,
						kind: 'feature_flag' as const,
						// Skills wear their kind on the checkout: "SKILL - <english title>".
						description: benefitDescription(`SKILL - ${english[index]?.title ?? f.title}`),
						runtime: null
					}
				]
			: []
	)
}

/** The included agent runtime as a benefit spec, when the plan has one. */
function runtimeSpec(p: Plan): BenefitSpec | null {
	if (!p.runtime) return null
	return {
		key: `runtime:${p.id}`,
		kind: 'runtime',
		description: benefitDescription(
			`MIND Credits — ${p.runtime.mindCredits} ${p.runtime.per === 'week' ? 'per week' : 'one-off'}`
		),
		runtime: p.runtime
	}
}

/** Per product tier: the skill flags — cascaded via the SSOT's `planIncludes`
 * law — then the runtime benefit. Deduped by key; avenNAME carries no skills,
 * just its one-off MIND-credit grant. */
export function productBenefitSpecs(): Record<ProductTier, BenefitSpec[]> {
	const out = {} as Record<ProductTier, BenefitSpec[]>
	for (const tier of PRODUCT_TIERS) {
		const specs: BenefitSpec[] = []
		for (const other of PLANS)
			if (planIncludes(tier, other.id)) specs.push(...skillFlagSpecs(other))
		const runtime = runtimeSpec(plan(tier))
		if (runtime) specs.push(runtime)
		const seen = new Set<string>()
		out[tier] = specs.filter((spec) => !seen.has(spec.key) && seen.add(spec.key))
	}
	return out
}
