import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = pkg.version
const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')
const heading = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\](?:\\s+-\\s+[^\\n]+)?\\s*$`, 'm')
const match = heading.exec(changelog)

if (!match) {
  console.error(`CHANGELOG.md 缺少当前版本章节：## [${version}]`)
  process.exit(1)
}

const start = match.index + match[0].length
const rest = changelog.slice(start)
const next = rest.search(/^## \[/m)
const body = (next === -1 ? rest : rest.slice(0, next)).trim()

if (!body) {
  console.error(`CHANGELOG.md 的版本 ${version} 没有更新内容。`)
  process.exit(1)
}

const tag = process.argv[2]
if (tag && tag !== `v${version}`) {
  console.error(`Git tag ${tag} 与 package.json 版本 v${version} 不一致。`)
  process.exit(1)
}

writeFileSync(resolve(root, 'release-notes.md'), `${body}\n`, 'utf8')
console.log(`Release notes generated for FeelPost v${version}`)
