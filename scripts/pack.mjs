import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const builder = resolve(root, 'node_modules/electron-builder/cli.js')
const args = [builder]

if (process.platform === 'darwin') {
  args.push('--mac', 'dmg', '-c.electronDist=node_modules/electron/dist')
} else if (process.platform === 'win32') {
  args.push('--win', 'nsis', '-c.electronDist=node_modules/electron/dist')
} else {
  console.error('npm run pack 只支持 macOS 和 Windows。')
  process.exit(1)
}

const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: 'inherit',
  env: process.env
})
process.exit(result.status ?? 1)
