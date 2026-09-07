// Sync every product (the one-off avenNAME and the recurring tiers) AND their
// benefits at the payment provider — idempotent, safe to run on every deploy.
// Products are found by `metadata.tier`, benefits by `metadata.key`; both are
// created when missing and drift-corrected from the brand's pricing SSOT,
// nothing here is hand-typed.
import 'dotenv/config'
import { createPaymentProvider } from '../src/lib/server/billing/fake.js'
import { productSeeds } from '../src/lib/server/billing/seeds.js'
import { loadApiConfig } from '../src/lib/server/config.js'

const config = loadApiConfig()
const payments = createPaymentProvider(config)
const map = await payments.ensureProducts(productSeeds())
process.stdout.write(`Billing products ready (${payments.kind}): ${JSON.stringify(map)}\n`)
const benefits = await payments.ensureBenefits()
process.stdout.write(`Billing benefits attached: ${JSON.stringify(benefits)}\n`)
