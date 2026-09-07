import { PolarProvider } from '../../services/checkout/src/lib/server/billing/polar.js'
import type { PaymentProvider } from '../../services/checkout/src/lib/server/billing/provider.js'
import { productSeeds } from '../../services/checkout/src/lib/server/billing/seeds.js'

export interface PolarCatalogInput {
	accessToken: string
	organizationId: string
	server: 'sandbox' | 'production'
	publicBaseUrl: string
	webhookSecret: string
}

export interface PolarCatalogResult {
	products: Record<string, string>
	benefits: Record<string, number>
}

type CatalogProvider = Pick<PaymentProvider, 'ensureProducts' | 'ensureBenefits'>

/** Applies the checkout pricing SSOT during provider bootstrap and every deployment. */
export async function ensurePolarCatalog(
	input: PolarCatalogInput,
	provider: CatalogProvider = new PolarProvider({
		PUBLIC_BASE_URL: input.publicBaseUrl,
		POLAR_API_KEY: input.accessToken,
		POLAR_SERVER: input.server,
		POLAR_ORGANIZATION_ID: input.organizationId,
		POLAR_WEBHOOK_SECRET: input.webhookSecret
	})
): Promise<PolarCatalogResult> {
	const products = await provider.ensureProducts(productSeeds())
	const benefits = await provider.ensureBenefits()
	return { products, benefits }
}
