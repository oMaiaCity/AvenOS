export interface DirectoryBinding {
	id: string
	hostname: string
	repository_full_name: string
	clone_url: string
	source_ref: string
	artifact_ref: string
	artifact_path: string
	verification_mode: 'txt' | 'operator'
	verification_token_hash: string
	verified_at: string | null
	owner_is_admin: boolean
}

const githubRepository = /^[a-z0-9_.-]{1,100}\/[-a-z0-9_.]{1,100}$/
const gitRef = /^refs\/heads\/(?![./-])(?!.*(?:\.\.|\/\/|@\{|\\))[A-Za-z0-9._/-]{1,200}(?<![./])$/
const gitRefComponent = /^(?!\.)(?!.*\.lock$)[A-Za-z0-9._-]+$/

function validGitRef(ref: string): boolean {
	if (!gitRef.test(ref)) return false
	const branch = ref.slice('refs/heads/'.length)
	return branch !== '@' && branch.split('/').every((component) => gitRefComponent.test(component))
}

export function validateBinding(binding: DirectoryBinding): void {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(binding.id))
		throw new Error('invalid binding id')
	if (
		!/^(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(binding.hostname) ||
		binding.hostname.length > 253 ||
		((binding.hostname === 'aven.ceo' || binding.hostname.endsWith('.aven.ceo')) &&
			binding.owner_is_admin !== true)
	)
		throw new Error('invalid or reserved hostname')
	if (typeof binding.owner_is_admin !== 'boolean') throw new Error('invalid account authorization')
	if (
		!githubRepository.test(binding.repository_full_name) ||
		binding.repository_full_name.includes('..')
	)
		throw new Error('invalid GitHub repository')
	if (binding.clone_url !== `https://github.com/${binding.repository_full_name}.git`)
		throw new Error('clone URL does not match the GitHub repository')
	if (!validGitRef(binding.source_ref)) throw new Error('invalid source ref')
	if (!validGitRef(binding.artifact_ref) || !binding.artifact_ref.startsWith('refs/heads/deploy/'))
		throw new Error('invalid deployment ref')
	if (binding.artifact_path !== 'dist') throw new Error('only the dist artifact path is supported')
	if (!['txt', 'operator'].includes(binding.verification_mode))
		throw new Error('invalid verification mode')
	if (
		binding.verification_mode === 'operator' &&
		(binding.owner_is_admin !== true ||
			!(binding.hostname === 'aven.ceo' || binding.hostname.endsWith('.aven.ceo')))
	)
		throw new Error('operator verification is restricted to platform-managed aven.ceo sites')
	if (!/^[0-9a-f]{64}$/.test(binding.verification_token_hash))
		throw new Error('invalid verification token hash')
}
