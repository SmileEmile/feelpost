import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Electron-builder afterPack hook.
 *
 * Alpha builds do not have an Apple Developer ID certificate. Without a valid
 * bundle signature macOS reports the app as "damaged" and never offers the
 * "Open Anyway" flow. An ad-hoc signature is free and makes the bundle valid;
 * users may still need to confirm the unidentified developer prompt.
 *
 * If electron-builder later signs with a real Developer ID, that signature
 * wins. If a real signature is already present here, leave it untouched.
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)
  if (!existsSync(appPath)) {
    throw new Error(`[adhoc-sign] App bundle not found: ${appPath}`)
  }

  let existing = ''
  try {
    existing = execFileSync('codesign', ['-dv', '--verbose=4', appPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    // An unsigned bundle fails `codesign -dv`; continue with ad-hoc signing.
    existing = String(error?.stdout || '') + String(error?.stderr || '')
  }

  if (/TeamIdentifier=(?!not set)\S+/.test(existing)) {
    console.log(`[adhoc-sign] Developer ID signature already present, skipping: ${appPath}`)
    return
  }

  console.log(`[adhoc-sign] Applying ad-hoc signature: ${appPath}`)
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath],
    { stdio: 'inherit' },
  )
  execFileSync(
    'codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    { stdio: 'inherit' },
  )
  console.log('[adhoc-sign] Ad-hoc signature verified')
}
