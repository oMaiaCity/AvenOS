import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const siblingRoot = dirname(repo)
const args = process.argv.slice(2)
const hasRuntimeArgument = args.includes('--onnxruntime')
const runtimeCandidates = [
	process.env.ORT_DYLIB_PATH,
	join(repo, 'app/src-tauri/resources/onnxruntime/libonnxruntime.so'),
	join(repo, 'target/rust/debug/onnxruntime/libonnxruntime.so'),
	join(siblingRoot, 'avenOS/target/rust/debug/onnxruntime/libonnxruntime.so'),
	join(siblingRoot, 'avenOS-software-first-voice/target/rust/debug/onnxruntime/libonnxruntime.so')
].filter((candidate): candidate is string => Boolean(candidate))
const runtime = runtimeCandidates.find(existsSync)

if (process.platform === 'linux' && !hasRuntimeArgument && !runtime) {
	throw new Error(
		'ONNX Runtime was not found. Run the app once or pass --onnxruntime /path/to/libonnxruntime.so.'
	)
}

const environment = { ...process.env }
if (runtime && !hasRuntimeArgument) environment.ORT_DYLIB_PATH = runtime

const localAlsa = '/tmp/aven-alsa-dev/root/usr/lib/x86_64-linux-gnu'
if (process.platform === 'linux' && existsSync(join(localAlsa, 'pkgconfig/alsa.pc'))) {
	environment.PKG_CONFIG_PATH = [join(localAlsa, 'pkgconfig'), environment.PKG_CONFIG_PATH]
		.filter(Boolean)
		.join(':')
	environment.LIBRARY_PATH = [localAlsa, environment.LIBRARY_PATH].filter(Boolean).join(':')
}

const command = [
	'cargo',
	'run',
	'--locked',
	'--manifest-path',
	join(repo, 'libs/aven-voice-host-cpal/Cargo.toml'),
	'--features',
	'duplex-lab',
	'--bin',
	'aven-voice-duplex-lab',
	'--',
	...args
]
const child = Bun.spawn(command, {
	cwd: repo,
	env: environment,
	stdin: 'inherit',
	stdout: 'inherit',
	stderr: 'inherit'
})
process.exit(await child.exited)
