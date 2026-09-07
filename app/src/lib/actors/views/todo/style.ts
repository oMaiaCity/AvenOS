import { withBrand } from '@myavenceo/aven-ceo/vibe-style'
import type { StyleDef } from '@myavenceo/aven-vibes'

/**
 * One style for both todo views, on brand tokens — the same selectors
 * serve the list and the board, so the two windows read as one app.
 */
const selectors: StyleDef['selectors'] = {
	'.wi-shell': {
		width: '100%',
		display: 'flex',
		flexDirection: 'column',
		gap: 'var(--gap-section)'
	},

	'.wi-head': {
		display: 'flex',
		alignItems: 'flex-end',
		justifyContent: 'space-between',
		gap: '1rem'
	},
	'.wi-title': {
		margin: '0',
		fontSize: 'var(--fs-hero)',
		fontWeight: '500',
		letterSpacing: '-0.02em'
	},
	'.wi-head-stat': { textAlign: 'right' },
	'.wi-stat-label': {
		fontSize: 'var(--fs-micro)',
		color: 'var(--muted)',
		textTransform: 'uppercase',
		letterSpacing: '0.08em'
	},
	'.wi-stat-value': { fontSize: 'var(--fs-hero)', fontWeight: '500', color: 'var(--primary)' },

	'.wi-add': { display: 'flex', gap: '0.5rem' },
	'.wi-add-input': {
		flex: '1',
		minWidth: '0',
		fontSize: 'var(--fs-body)',
		padding: '0.6rem 0.9rem',
		borderRadius: 'var(--radius-pill)',
		border: '1px solid var(--border)',
		background: 'var(--surface)',
		color: 'var(--ink)',
		outline: 'none'
	},
	'.wi-add-btn': {
		fontSize: 'var(--fs-body)',
		fontWeight: '600',
		padding: '0.6rem 1.2rem',
		borderRadius: 'var(--radius-pill)',
		border: 'none',
		background: 'var(--primary)',
		color: 'var(--primary-foreground)',
		cursor: 'pointer'
	},

	'.wi-list': {
		listStyle: 'none',
		margin: '0',
		padding: '0',
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem'
	},
	'.wi-row': {
		display: 'flex',
		alignItems: 'center',
		gap: '0.75rem',
		padding: '0.7rem 0.9rem',
		borderRadius: 'var(--radius-card)',
		border: '1px solid var(--border)',
		background: 'var(--surface)'
	},
	'.wi-row--done': { opacity: '0.55' },
	'.wi-row--done .wi-row-title': { textDecoration: 'line-through' },
	'.wi-row-main': { flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column' },
	'.wi-row-meta': { fontSize: '11px', opacity: '0.55' },

	'.wi-row-title': { flex: '1', minWidth: '0', fontSize: 'var(--fs-body)' },

	'.wi-badge': {
		fontSize: 'var(--fs-micro)',
		fontWeight: '600',
		padding: '0.15rem 0.6rem',
		borderRadius: 'var(--radius-pill)',
		border: '1px solid var(--border)',
		background: 'var(--bg-a)',
		color: 'var(--muted-strong)',
		whiteSpace: 'nowrap'
	},
	'.wi-badge--doing': { background: 'var(--secondary)', color: 'var(--primary)' },
	'.wi-badge--done': { background: 'var(--primary)', color: 'var(--primary-foreground)' },

	'.wi-delete': {
		border: 'none',
		background: 'transparent',
		color: 'var(--muted)',
		fontSize: '1.1rem',
		lineHeight: '1',
		cursor: 'pointer',
		padding: '0.2rem 0.4rem'
	},

	'.wi-foot': {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: '1rem'
	},
	'.wi-progress': { fontSize: 'var(--fs-micro)', color: 'var(--muted)' },
	'.wi-clear': {
		fontSize: 'var(--fs-micro)',
		fontWeight: '600',
		border: '1px solid var(--border)',
		background: 'transparent',
		color: 'var(--muted-strong)',
		padding: '0.35rem 0.8rem',
		borderRadius: 'var(--radius-pill)',
		cursor: 'pointer'
	},

	'.wi-board': {
		display: 'grid',
		gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
		gap: '0.75rem',
		alignItems: 'start'
	},
	'.wi-column': {
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem',
		padding: '0.75rem',
		borderRadius: 'var(--radius-card)',
		border: '1px solid var(--border)',
		background: 'var(--bg-a)'
	},
	'.wi-column-head': {
		display: 'flex',
		alignItems: 'baseline',
		justifyContent: 'space-between'
	},
	'.wi-column-label': {
		fontSize: 'var(--fs-micro)',
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: '0.08em',
		color: 'var(--muted-strong)'
	},
	'.wi-column-count': { fontSize: 'var(--fs-micro)', color: 'var(--muted)' },
	'.wi-column-body': { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
	'.wi-card': {
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem',
		padding: '0.7rem 0.8rem',
		borderRadius: 'var(--radius-card)',
		border: '1px solid var(--border)',
		background: 'var(--surface)'
	},
	'.wi-card-title': { fontSize: 'var(--fs-body)' },
	'.wi-card .wi-badge': { alignSelf: 'flex-start', cursor: 'pointer' }
}

/**
 * Task surfaces breathe at 6xl (72rem) — wider than the brand's 56rem
 * default; the token override wins over the brand layer.
 */
export const todoStyle: StyleDef = withBrand({ tokens: { 'max-w': '72rem' }, selectors })
