import { randomUUID } from 'node:crypto'
import { promises as fs, type Dirent } from 'node:fs'
import { join } from 'node:path'
import type {
  CreateProjectInput,
  DirectoryCheck,
  Environment,
  EnvironmentParams,
  ProjectDetail,
  ProjectSummary,
  UpdateProjectInput
} from '@shared/contract'
import { AppException } from '../errors'
import { lastRunFile, projectDir, projectsRoot } from '../storage/paths'
import {
  countJsonFiles,
  ensureDir,
  listDirs,
  readJson,
  removeDir,
  writeJsonAtomic
} from '../storage/json-store'

interface ProjectFile {
  id: string
  name: string
  sourceDir: string
  description: string
  excludePatterns: string[]
  schemaVersion: number
  createdAt: string
  updatedAt: string
  lastScanAt: string | null
  sourceDirChangedAt?: string | null
  packageAliases?: Record<string, string>
}

const EMPTY_PARAMS: EnvironmentParams = { headers: [], query: [], cookies: [], body: [] }
const DEFAULT_EXCLUDES = ['target', 'build', 'node_modules', '.git']

function now(): string {
  return new Date().toISOString()
}

function normalizeBaseUrl(raw?: string): string {
  const value = raw?.trim()
  if (!value) return 'http://localhost:8080'
  return /^https?:\/\//i.test(value) ? value : `http://${value}`
}

function defaultEnvironment(localEnvUrl?: string): Environment {
  return {
    id: randomUUID(),
    name: '本地',
    baseUrl: normalizeBaseUrl(localEnvUrl),
    params: { headers: [], query: [], cookies: [], body: [] },
    verifyTls: true,
    proxy: '',
    noProxy: [],
    timeoutMs: 30000,
    isDefault: true
  }
}

export class ProjectService {
  constructor(private readonly dataDir: string) {}

  private async readProject(projectId: string): Promise<ProjectFile> {
    const file = join(projectDir(this.dataDir, projectId), 'project.json')
    const project = await readJson<ProjectFile>(file)
    if (!project) throw new AppException('NOT_FOUND', '项目不存在或已被删除。')
    return project
  }

  private async readEnvironments(projectId: string): Promise<Environment[]> {
    const file = join(projectDir(this.dataDir, projectId), 'environments.json')
    return (await readJson<Environment[]>(file)) ?? []
  }

  private async readGlobals(projectId: string): Promise<EnvironmentParams> {
    const file = join(projectDir(this.dataDir, projectId), 'globals.json')
    return (await readJson<EnvironmentParams>(file)) ?? EMPTY_PARAMS
  }

  private async lastScanTime(project: ProjectFile): Promise<string | null> {
    if (project.lastScanAt) return project.lastScanAt
    const run = await readJson<{ finishedAt?: string }>(lastRunFile(this.dataDir, project.id))
    return run?.finishedAt ?? null
  }

  private async toSummary(project: ProjectFile): Promise<ProjectSummary> {
    const dir = projectDir(this.dataDir, project.id)
    const envs = await this.readEnvironments(project.id)
    return {
      id: project.id,
      name: project.name,
      sourceDir: project.sourceDir,
      interfaceCount: await countJsonFiles(join(dir, 'interfaces')),
      caseCount: await countJsonFiles(join(dir, 'cases')),
      envCount: envs.length,
      lastScanAt: await this.lastScanTime(project)
    }
  }

  async markScanned(projectId: string, at: string = now()): Promise<void> {
    const project = await this.readProject(projectId)
    project.lastScanAt = at
    project.updatedAt = at
    await writeJsonAtomic(join(projectDir(this.dataDir, projectId), 'project.json'), project)
  }

  async list(): Promise<ProjectSummary[]> {
    const ids = await listDirs(projectsRoot(this.dataDir))
    const projects: ProjectSummary[] = []
    for (const id of ids) {
      try {
        const project = await this.readProject(id)
        projects.push(await this.toSummary(project))
      } catch {
        // Skip unreadable project directories instead of breaking the list.
      }
    }
    return projects.sort((a, b) => a.name.localeCompare(b.name))
  }

  async get(projectId: string): Promise<ProjectDetail> {
    const project = await this.readProject(projectId)
    return {
      ...(await this.toSummary(project)),
      description: project.description,
      excludePatterns: project.excludePatterns,
      schemaVersion: project.schemaVersion,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      environments: await this.readEnvironments(projectId),
      globalParams: await this.readGlobals(projectId),
      packageAliases: project.packageAliases ?? {},
    }
  }

  async create(input: CreateProjectInput): Promise<ProjectDetail> {
    const name = input.name?.trim()
    const sourceDir = input.sourceDir?.trim() ?? ''
    if (!name) throw new AppException('VALIDATION', '项目名称不能为空。')
    if (sourceDir) await this.assertDirectory(sourceDir)

    const existing = await this.list()
    if (sourceDir && existing.some((project) => project.sourceDir === sourceDir)) {
      throw new AppException('CONFLICT', '该源码目录已经关联了一个项目。')
    }

    const id = randomUUID()
    const dir = projectDir(this.dataDir, id)
    await ensureDir(join(dir, 'interfaces'))
    await ensureDir(join(dir, 'cases'))
    await ensureDir(join(dir, 'examples'))
    await ensureDir(join(dir, 'scan'))

    const timestamp = now()
    const project: ProjectFile = {
      id,
      name,
      sourceDir,
      description: input.description?.trim() || '',
      excludePatterns: [...DEFAULT_EXCLUDES],
      schemaVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastScanAt: null,
      sourceDirChangedAt: null,
      packageAliases: {},
    }
    await writeJsonAtomic(join(dir, 'project.json'), project)
    await writeJsonAtomic(join(dir, 'environments.json'), [defaultEnvironment(input.localEnvUrl)])
    await writeJsonAtomic(join(dir, 'globals.json'), EMPTY_PARAMS)
    return this.get(id)
  }

  async update(input: UpdateProjectInput): Promise<ProjectDetail> {
    const project = await this.readProject(input.projectId)
    const patch = input.patch
    if (patch.name !== undefined && !patch.name.trim()) {
      throw new AppException('VALIDATION', '项目名称不能为空。')
    }
    if (patch.sourceDir !== undefined) {
      const nextDir = patch.sourceDir.trim()
      if (nextDir) await this.assertDirectory(nextDir)
      if (nextDir !== project.sourceDir) {
        project.sourceDir = nextDir
        project.sourceDirChangedAt = nextDir ? now() : null
      }
    }
    if (patch.name !== undefined) project.name = patch.name.trim()
    if (patch.description !== undefined) project.description = patch.description.trim()
    if (patch.excludePatterns !== undefined) {
      project.excludePatterns = patch.excludePatterns.map((item) => item.trim()).filter(Boolean)
    }
    project.updatedAt = now()
    await writeJsonAtomic(join(projectDir(this.dataDir, project.id), 'project.json'), project)
    return this.get(project.id)
  }

  async updatePackageAlias(projectId: string, packageName: string, label: string | null): Promise<void> {
    const project = await this.readProject(projectId)
    const key = packageName.trim()
    if (!key) throw new AppException('VALIDATION', '包名不能为空。')
    const aliases = { ...(project.packageAliases ?? {}) }
    const value = label?.trim() ?? ''
    if (value) aliases[key] = value
    else delete aliases[key]
    project.packageAliases = aliases
    project.updatedAt = now()
    await writeJsonAtomic(join(projectDir(this.dataDir, projectId), 'project.json'), project)
  }

  async remove(projectId: string): Promise<void> {
    await this.readProject(projectId)
    await removeDir(projectDir(this.dataDir, projectId))
  }

  async listModules(projectId: string): Promise<Array<{ name: string; path: string }>> {
    const project = await this.readProject(projectId)
    if (!project.sourceDir) return []
    const pomPath = join(project.sourceDir, 'pom.xml')
    let xml = ''
    try {
      xml = await fs.readFile(pomPath, 'utf8')
    } catch {
      return []
    }
    const modules: Array<{ name: string; path: string }> = []
    for (const match of xml.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) {
      const modulePath = match[1].trim()
      if (!modulePath) continue
      try {
        const stat = await fs.stat(join(project.sourceDir, modulePath))
        if (!stat.isDirectory()) continue
      } catch {
        continue
      }
      modules.push({ name: modulePath.split('/').pop() || modulePath, path: modulePath })
    }
    return modules
  }

  async getGlobals(projectId: string): Promise<EnvironmentParams> {
    await this.readProject(projectId)
    return this.readGlobals(projectId)
  }

  async updateGlobals(projectId: string, params: EnvironmentParams): Promise<EnvironmentParams> {
    await this.readProject(projectId)
    const normalized: EnvironmentParams = {
      headers: params.headers ?? [],
      query: params.query ?? [],
      cookies: params.cookies ?? [],
      body: params.body ?? []
    }
    await writeJsonAtomic(join(projectDir(this.dataDir, projectId), 'globals.json'), normalized)
    return normalized
  }

  async validateDirectory(dir: string): Promise<DirectoryCheck> {
    try {
      const stat = await fs.stat(dir)
      if (!stat.isDirectory()) {
        return { valid: false, hasBuildFile: false, controllerCount: 0, reason: '路径不是目录。' }
      }
    } catch {
      return { valid: false, hasBuildFile: false, controllerCount: 0, reason: '目录不存在或不可读。' }
    }
    const names = await fs.readdir(dir).catch(() => [] as string[])
    const hasBuildFile = names.some((name: string) => ['pom.xml', 'build.gradle', 'build.gradle.kts'].includes(name))
    const controllerCount = await countControllers(dir)
    return { valid: true, hasBuildFile, controllerCount }
  }

  private async assertDirectory(dir: string): Promise<void> {
    const check = await this.validateDirectory(dir)
    if (!check.valid) throw new AppException('VALIDATION', check.reason ?? '源码目录不可用。')
  }
}

async function countControllers(root: string): Promise<number> {
  const skip = new Set(['node_modules', 'target', 'build', '.git', 'out', 'dist'])
  let visited = 0
  let controllers = 0
  const stack = [root]
  while (stack.length && visited < 5000) {
    const current = stack.pop() as string
    let entries: Dirent[]
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      visited += 1
      if (visited >= 5000) break
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(join(current, entry.name))
      } else if (entry.isFile() && entry.name.endsWith('Controller.java')) {
        controllers += 1
      }
    }
  }
  return controllers
}
