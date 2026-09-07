export const systemEmailTemplates = [
	'name.purchase-link',
	'name.purchased',
	'identity.security'
] as const
export type SystemEmailTemplate = (typeof systemEmailTemplates)[number]

export interface TemplateDataMap {
	'identity.security': { message: string; accessUrl: string; baseUrl: string }
	'name.purchase-link': { name: string; claimUrl: string; expiresAt: string; baseUrl: string }
	'name.purchased': { name: string; accessUrl: string; baseUrl: string }
}

export type TemplateData<T extends SystemEmailTemplate> = TemplateDataMap[T]

export const emailTemplateFields = {
	'identity.security': ['message', 'accessUrl', 'baseUrl'],
	'name.purchase-link': ['name', 'claimUrl', 'expiresAt', 'baseUrl'],
	'name.purchased': ['name', 'accessUrl', 'baseUrl']
} as const satisfies Record<SystemEmailTemplate, readonly string[]>

export const emailTemplateTokens = {
	message: 'AVENEMAILTOKENMESSAGE9A7E3B',
	name: 'AVENEMAILTOKENNAME7D8F2A',
	claimUrl: 'AVENEMAILTOKENCLAIMURL4C1E9B',
	expiresAt: 'AVENEMAILTOKENEXPIRESAT6A3D5C',
	accessUrl: 'AVENEMAILTOKENACCESSURL8B2F4D',
	baseUrl: 'AVENEMAILTOKENBASEURL3E7C1F'
} as const

export type EmailTemplateField = keyof typeof emailTemplateTokens
