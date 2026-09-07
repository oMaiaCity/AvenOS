import { z } from 'zod'

const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/
const branch = /^(?![./-])(?!.*(?:\.\.|\/\/|@\{|\\))[A-Za-z0-9._/-]{1,200}(?<![./])$/
const branchComponent = /^(?!\.)(?!.*\.lock$)[A-Za-z0-9._-]+$/
const repository = /^[A-Za-z0-9_.-]{1,100}\/[-A-Za-z0-9_.]{1,100}$/

export function normalizeSiteHostname(input: string, allowOperatorHostname = false): string {
	const hostname = input.trim().toLowerCase().replace(/\.$/, '')
	if (hostname !== input.toLowerCase().replace(/\.$/, '') || hostname.length > 253)
		throw new Error('hostname must not contain surrounding whitespace')
	if (hostname.split('.').length < 2 || hostname.split('.').some((part) => !label.test(part)))
		throw new Error('hostname must be an ASCII fully-qualified domain name')
	if (!allowOperatorHostname && (hostname === 'aven.ceo' || hostname.endsWith('.aven.ceo')))
		throw new Error('aven.ceo and its subdomains are platform-managed')
	return hostname
}

export function normalizeRepository(input: string): string {
	if (!repository.test(input) || input.includes('..'))
		throw new Error('repository must be a GitHub owner/repository name')
	return input.toLowerCase()
}

export function normalizeBranch(input: string, deployment = false): string {
	if (
		!branch.test(input) ||
		input === '@' ||
		input.split('/').some((component) => !branchComponent.test(component))
	)
		throw new Error('invalid Git branch name')
	if (deployment && !input.startsWith('deploy/'))
		throw new Error('deploymentBranch must start with deploy/')
	return input
}

const transformed = (normalize: (value: string) => string) =>
	z.string().transform((value, context) => {
		try {
			return normalize(value)
		} catch (error) {
			context.addIssue({ code: 'custom', message: (error as Error).message })
			return z.NEVER
		}
	})

export const siteBindingInputSchema = z.object({
	hostname: transformed((value) => normalizeSiteHostname(value)),
	repository: transformed(normalizeRepository),
	sourceBranch: transformed((value) => normalizeBranch(value)),
	deploymentBranch: transformed((value) => normalizeBranch(value, true))
})

export const systemSiteSchema = z.object({
	hostname: transformed((value) => normalizeSiteHostname(value, true)),
	repository: transformed(normalizeRepository),
	sourceBranch: transformed((value) => normalizeBranch(value)),
	deploymentBranch: transformed((value) => normalizeBranch(value, true))
})

export type SiteBindingInput = z.infer<typeof siteBindingInputSchema>
export type SystemSiteInput = z.infer<typeof systemSiteSchema>
