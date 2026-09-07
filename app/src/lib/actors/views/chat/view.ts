import { withBrand } from '@myavenceo/aven-ceo/vibe-style'
import type { StyleDef, ViewDef } from '@myavenceo/aven-vibes'

/**
 * The conversation as a WINDOW — the chat rendered by the same universal
 * engine as every other actor view: validated JSON over the actor's state,
 * no bespoke Svelte. Input stays with the voice pill (the one door for
 * words); this window is the transcript, live.
 */

export const chatView: ViewDef = {
	content: {
		class: 'brand-shell ch-shell',
		children: [
			{
				class: 'ch-log',
				$each: {
					items: '$rows',
					template: {
						class: '$$rowClass',
						children: [{ class: '$$bubbleClass', text: '$$content' }]
					}
				}
			},
			{ class: '$statusClass', text: '$statusText' }
		]
	}
}

const selectors: StyleDef['selectors'] = {
	'.ch-shell': { display: 'flex', flexDirection: 'column', gap: '12px' },
	'.ch-log': { display: 'flex', flexDirection: 'column', gap: '10px' },
	'.ch-row': { display: 'flex', justifyContent: 'flex-start' },
	'.ch-row--me': { justifyContent: 'flex-end' },
	'.ch-bubble': {
		maxWidth: '85%',
		padding: '10px 14px',
		borderRadius: '16px',
		fontSize: '14px',
		lineHeight: '1.5',
		whiteSpace: 'pre-wrap',
		background: 'var(--color-ivory)',
		border: '1px solid rgba(30,41,59,0.1)'
	},
	'.ch-bubble--me': {
		background: 'var(--color-marine)',
		color: 'var(--color-linen)',
		border: 'none'
	},
	'.ch-bubble--speaker-two': {
		background: 'color-mix(in srgb, var(--color-marine) 82%, var(--color-progress))'
	},
	'.ch-bubble--speaker-three': {
		background: 'color-mix(in srgb, var(--color-marine) 82%, var(--color-success))'
	},
	'.ch-status': { fontSize: '12px', opacity: '0.5', textAlign: 'center' },
	'.ch-status--hidden': { display: 'none' }
}

export const chatStyle: StyleDef = withBrand({ tokens: { 'max-w': '56rem' }, selectors })
