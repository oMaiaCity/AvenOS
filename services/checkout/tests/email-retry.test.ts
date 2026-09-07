import { describe, expect, it } from 'vitest'
import {
	classifySmtpFailure,
	describeSmtpEndpoint,
	retryDelaySeconds
} from '../src/lib/server/email/worker.js'

describe('email retry policy', () => {
	it('backs off exponentially with a cap', () => {
		expect(retryDelaySeconds(1, 30, 21600, () => 0)).toBe(30)
		expect(retryDelaySeconds(2, 30, 21600, () => 0)).toBe(60)
		expect(retryDelaySeconds(20, 30, 21600, () => 0)).toBe(21600)
	})

	it('adds bounded jitter', () => {
		expect(retryDelaySeconds(1, 30, 21600, () => 0.999)).toBeLessThanOrEqual(30 + 8)
	})

	it('classifies permanent 5xx as dead and 4xx as retry', () => {
		expect(classifySmtpFailure({ responseCode: 550 })).toBe('dead')
		expect(classifySmtpFailure({ responseCode: 421 })).toBe('retry')
		expect(classifySmtpFailure({ code: 'ETIMEDOUT' })).toBe('retry')
		expect(classifySmtpFailure(new Error('weird'))).toBe('dead')
	})

	it('describes SMTP endpoints without exposing credentials', () => {
		expect(describeSmtpEndpoint('smtps://operator:secret@smtp.example.test:465')).toEqual({
			protocol: 'smtps',
			host: 'smtp.example.test',
			port: 465,
			secure: true
		})
		expect(describeSmtpEndpoint('smtp://operator:secret@smtp.example.test')).toEqual({
			protocol: 'smtp',
			host: 'smtp.example.test',
			port: 587,
			secure: false
		})
	})
})
