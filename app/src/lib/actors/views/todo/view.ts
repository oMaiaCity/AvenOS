import type { ViewDef } from '@myavenceo/aven-vibes'

/**
 * The two views of todo, as validated JSON: the list and the board —
 * one actor, one reducer, two windows. Every interactive element sends an
 * event the sandboxed logic reduces; the view itself computes nothing.
 *
 * `$each` sits ON the container node — a child-wrapped `$each` inserts an
 * anonymous div between container and items, which breaks grid/flex
 * relationships (the stacked-kanban bug).
 */

export const todoListView: ViewDef = {
	content: {
		class: 'brand-shell wi-shell',
		children: [
			{
				class: 'wi-head',
				children: [
					{
						children: [
							{ class: 'eyebrow', text: 'Tasks' },
							{ tag: 'h1', class: 'wi-title', text: '$sparkName' }
						]
					},
					{
						class: 'wi-head-stat',
						children: [
							{ class: 'wi-stat-label', text: 'Open' },
							{ class: 'wi-stat-value', text: '$counts.open' }
						]
					}
				]
			},
			{
				tag: 'ul',
				class: 'wi-list',
				$each: {
					items: '$rows',
					template: {
						tag: 'li',
						class: '$$rowClass',
						children: [
							{
								tag: 'input',
								attrs: {
									type: 'checkbox',
									checked: '$$checked',
									'aria-label': 'Toggle done'
								},
								$on: { change: { send: 'TOGGLE', payload: { id: '$$id' } } }
							},
							{
								class: 'wi-row-main',
								children: [
									{ class: 'wi-row-title', text: '$$title' },
									{ class: 'wi-row-meta', text: '$$metaLabel' }
								]
							},
							{ class: '$$badgeClass', text: '$$statusLabel' },
							{
								tag: 'button',
								class: 'wi-delete',
								attrs: { type: 'button', 'aria-label': 'Delete' },
								text: '×',
								$on: { click: { send: 'DELETE', payload: { id: '$$id' } } }
							}
						]
					}
				}
			},
			{
				class: 'wi-foot',
				children: [
					{ class: 'wi-progress', text: '$progressText' },
					{
						tag: 'button',
						class: 'wi-clear',
						attrs: { type: 'button' },
						text: 'Clear done',
						$on: { click: { send: 'CLEAR_DONE' } }
					}
				]
			}
		]
	}
}

export const todoBoardView: ViewDef = {
	content: {
		class: 'brand-shell wi-shell',
		children: [
			{
				class: 'wi-head',
				children: [
					{
						children: [
							{ class: 'eyebrow', text: 'Board' },
							{ tag: 'h1', class: 'wi-title', text: '$sparkName' }
						]
					}
				]
			},
			{
				class: 'wi-board',
				$each: {
					items: '$columns',
					template: {
						class: 'wi-column',
						children: [
							{
								class: 'wi-column-head',
								children: [
									{ class: 'wi-column-label', text: '$$label' },
									{ class: 'wi-column-count', text: '$$count' }
								]
							},
							{
								class: 'wi-column-body',
								$each: {
									items: '$$rows',
									template: {
										class: 'wi-card',
										children: [
											{ class: 'wi-card-title', text: '$$title' },
											{
												tag: 'button',
												class: '$$badgeClass',
												attrs: { type: 'button' },
												text: '$$statusLabel',
												$on: { click: { send: 'CYCLE', payload: { id: '$$id' } } }
											}
										]
									}
								}
							}
						]
					}
				}
			}
		]
	}
}
