import {
	type EmailTemplateField,
	emailTemplateTokens,
	type SystemEmailTemplate,
	type TemplateData,
	type TemplateDataMap
} from './template-contract.js'
import { compiledEmailTemplates } from './templates.generated.js'

export {
	type SystemEmailTemplate,
	systemEmailTemplates,
	type TemplateData,
	type TemplateDataMap
} from './template-contract.js'

export interface RenderedEmail {
	subject: string
	text: string
	html: string
}

export function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;')
}

const tokenEntries = Object.entries(emailTemplateTokens) as Array<[EmailTemplateField, string]>
const fieldByToken = new Map(tokenEntries.map(([field, token]) => [token, field]))
const tokenPattern = new RegExp(tokenEntries.map(([, token]) => token).join('|'), 'g')

function interpolate(
	template: string,
	data: Record<string, string>,
	transform: (value: string) => string
): string {
	return template.replace(tokenPattern, (token) => {
		const field = fieldByToken.get(token)
		if (!field) throw new Error(`Unknown compiled email token: ${token}`)
		return transform(data[field] ?? '')
	})
}

function subjectValue(value: string): string {
	return value.replace(/[\r\n]+/g, ' ').trim()
}

export function renderEmail<T extends SystemEmailTemplate>(
	template: T,
	data: TemplateData<T>
): RenderedEmail {
	const record = data as unknown as Record<string, string>
	const compiled = compiledEmailTemplates[template]
	const variant =
		template === 'identity.security'
			? compiledEmailTemplates['identity.security'].variants.default
			: template === 'name.purchased' && !(data as TemplateDataMap['name.purchased']).accessUrl
				? compiledEmailTemplates['name.purchased'].variants.withoutAccess
				: template === 'name.purchased'
					? compiledEmailTemplates['name.purchased'].variants.withAccess
					: compiledEmailTemplates['name.purchase-link'].variants.default
	return {
		subject: interpolate(compiled.subject, record, subjectValue),
		text: interpolate(variant.text, record, (value) => value),
		html: interpolate(variant.html, record, escapeHtml)
	}
}
