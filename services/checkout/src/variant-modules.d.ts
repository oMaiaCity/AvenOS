declare module 'virtual:aven-app-runtime' {
	export const appRuntime: import('$lib/app-runtime/contract.js').AppRuntime
}

declare module 'virtual:aven-build-chrome' {
	const BuildChrome: import('svelte').Component
	export default BuildChrome
}

declare module 'virtual:aven-server-build-runtime' {
	export const serverBuildRuntime: import('$lib/server/build-runtime/contract.js').ServerBuildRuntime
}
