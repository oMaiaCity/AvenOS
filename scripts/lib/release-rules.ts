// Separate update authority from mandatory checks: an administrator may update a
// release branch, but cannot bypass its PR/check requirements through this ruleset.
export function releaseRules() {
	const conditions = { ref_name: { include: ['refs/heads/next', 'refs/heads/prod'], exclude: [] } }
	return [
		{
			name: 'aven-release-update-authority',
			target: 'branch',
			enforcement: 'active',
			conditions,
			bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }],
			rules: [{ type: 'update' }, { type: 'deletion' }, { type: 'non_fast_forward' }]
		},
		{
			name: 'aven-release-merge-gate',
			target: 'branch',
			enforcement: 'active',
			conditions,
			bypass_actors: [],
			rules: [
				{
					type: 'pull_request',
					parameters: {
						required_approving_review_count: 0,
						dismiss_stale_reviews_on_push: true,
						require_code_owner_review: false,
						require_last_push_approval: false,
						required_review_thread_resolution: true,
						allowed_merge_methods: ['merge']
					}
				},
				{
					type: 'required_status_checks',
					parameters: {
						strict_required_status_checks_policy: true,
						do_not_enforce_on_create: false,
						required_status_checks: [{ context: 'Platform release gate', integration_id: 15368 }]
					}
				}
			]
		}
	]
}
