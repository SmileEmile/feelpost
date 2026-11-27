import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const child = spawn(command, ['run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FEELPOST_DATA_DIR: resolve(root, '.demo-data') }
})
child.on('exit', (code) => process.exit(code ?? 1))
