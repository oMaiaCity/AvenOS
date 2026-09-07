#!/usr/bin/env bun
import path from 'node:path'
import { TauriSession } from '../deploy/e2e/tauri-driver.js'

const application = path.resolve(process.argv[2] ?? '')
if (!application.endsWith('.AppImage')) throw new Error('Pass the built AppImage path.')
const driver = process.env.TAURI_DRIVER_BIN
if (!driver) throw new Error('TAURI_DRIVER_BIN must point to tauri-driver.')
// Exercise extraction, packaged libraries, WebKit, and the real auth gate with
// a fresh profile. Do not open a second browser or require a live login to pass.
process.env.APPIMAGE_EXTRACT_AND_RUN = '1'
process.env.BROWSER = '/usr/bin/true'
process.env.XDG_CURRENT_DESKTOP = 'aven-package-smoke'
const session = await TauriSession.launch(application, driver)
try {
	await session.findEventually('.flow-card-heading')
	await session.waitForBodyText('aven.id')
	if (!(await session.execute('return Boolean(window.__TAURI_INTERNALS__)')))
		throw new Error('The packaged native bridge is unavailable.')
	console.log('PASS: packaged AppImage loads its runtime, WebKit, native bridge, and auth gate.')
} finally {
	await session.close()
}
