/** IPC contract types shared by main, preload and renderer (design doc 05). */

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IO'
  | 'PARSE'
  | 'NETWORK'
  | 'TLS'
  | 'PROXY'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNSUPPORTED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH'
  | 'AI_RATE_LIMIT'
  | 'AI_NETWORK'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_OUTPUT'
  | 'AI_CANCELLED'
  | 'INTERNAL'

export interface AppError {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
  retryable?: boolean
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }


export interface AIConfig {
  enabled: boolean
  baseUrl: string
  model: string
  timeoutMs: number
}

export interface AIConfigPublic extends AIConfig {
  hasApiKey: boolean
  keyStorageMode: 'persistent' | 'session' | 'none'
}

export interface AIUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface AIMeta {
  source: 'ai'
  provider: 'openai-compatible'
  model: string
  promptVersion: string
  generatedAt: string
  contextHash: string
  cached?: boolean
  usage?: AIUsage
}

export type AIFeature = 'field-descriptions' | 'cases' | 'case-doc'
export type AICaseScenario = 'normal' | 'boundary' | 'error' | 'empty'

export type AIContextInput =
  | {
      feature: 'field-descriptions'
      projectId: string
      interfaceId: string
      target: 'request' | 'response'
      exampleId?: string
      draft?: RequestDraft
    }
  | {
      feature: 'cases'
      projectId: string
      interfaceId: string
      scenarios: AICaseScenario[]
    }
  | {
      feature: 'case-doc'
      projectId: string
      caseIds: string[]
    }

export type AIGenerateInput = AIContextInput & { contextHash: string }

export interface AIImportCasesInput {
  projectId: string
  interfaceId: string
  envId: string
  cases: AICaseCandidate[]
  meta: AIMeta
}

export interface AIContextPreview {
  hash: string
  feature: AIFeature
  estimatedTokens: number
  preview: unknown
  redactions: string[]
  truncated: boolean
}

export interface AIFieldDescriptionSuggestion {
  path: string
  description: string
  change?: 'add' | 'update' | 'same'
}

export interface AIFieldDescriptionResult {
  schemaVersion: 1
  fields: AIFieldDescriptionSuggestion[]
}

export interface AICaseCandidate {
  name: string
  scenario: AICaseScenario
  tags: string[]
  note: string
  request: RequestDraft
}

export interface AICaseResult {
  schemaVersion: 1
  cases: AICaseCandidate[]
}

export interface AIHandoffResult {
  schemaVersion: 1
  fileName?: string
  markdown: string
  typescript: string
}

export type AICompletionResult = AIFieldDescriptionResult | AICaseResult | AIHandoffResult

export interface AIStreamPayload {
  requestId: string
  delta: string
}

export interface AICompletedPayload {
  requestId: string
  feature: AIFeature
  result: AICompletionResult
  meta: AIMeta
}

export interface AIFailedPayload {
  requestId: string
  error: AppError
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  dataDir: string
  contractVersion: number
}

export interface Preferences {
  theme: 'light' | 'dark'
  dataDir: string
  debugLogging: boolean
  zoomFactor: number
  lastProjectId: string | null
  lastEnvByProject: Record<string, string>
  onboardingCompleted: boolean
  ai: AIConfig
}

export interface EnvironmentParams {
  headers: ParamRow[]
  query: ParamRow[]
  cookies: ParamRow[]
  body: ParamRow[]
}

export interface ParamRow {
  key: string
  value: string
  enabled: boolean
  description?: string
  kind?: 'text' | 'file'
  filePath?: string
  fileName?: string
}

export interface Environment {
  id: string
  name: string
  baseUrl: string
  params: EnvironmentParams
  verifyTls: boolean
  proxy: string
  noProxy: string[]
  timeoutMs: number
  isDefault: boolean
}

export interface ProjectSummary {
  id: string
  name: string
  sourceDir: string
  interfaceCount: number
  caseCount: number
  envCount: number
  lastScanAt: string | null
}

export interface ProjectDetail extends ProjectSummary {
  description: string
  excludePatterns: string[]
  schemaVersion: number
  createdAt: string
  updatedAt: string
  environments: Environment[]
  globalParams: EnvironmentParams
  packageAliases?: Record<string, string>
}

export interface CreateProjectInput {
  name: string
  sourceDir?: string
  description?: string
  localEnvUrl?: string
}

export interface UpdateProjectInput {
  projectId: string
  patch: {
    name?: string
    description?: string
    sourceDir?: string
    excludePatterns?: string[]
  }
}

export interface DirectoryCheck {
  valid: boolean
  hasBuildFile: boolean
  controllerCount: number
  reason?: string
}


export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type InterfaceStatus = 'registered' | 'changed' | 'archived'
export type ParseQuality = 'full' | 'partial' | 'failed'
export type ParamLocation = 'path' | 'query' | 'header' | 'cookie' | 'body'

export interface ParamField {
  location: ParamLocation
  path: string
  name: string
  type: string
  required: boolean
  defaultValue?: string
  description?: string
  children?: ParamField[]
}

export interface InterfaceParams {
  path: ParamField[]
  query: ParamField[]
  headers: ParamField[]
  cookies: ParamField[]
}

export interface BodyDefinition {
  type: 'json' | 'form' | 'multipart'
  fields: ParamField[]
}

export interface InterfaceSummary {
  id: string
  method: HttpMethod
  path: string
  name: string
  status: InterfaceStatus
  parseQuality: ParseQuality
  source: 'scan' | 'manual'
  module: string | null
  packageName: string | null
  nameOverridden?: boolean
  nameSource?: 'annotation' | 'javadoc' | 'method'
  manualDirectoryId?: string | null
}

export interface ManualOverride {
  location: ParamLocation
  key: string
  values: Partial<Pick<ParamField, 'type' | 'required' | 'description' | 'name'>>
}

export interface InterfaceDetail extends InterfaceSummary {
  summaryText: string
  controller: string | null
  params: InterfaceParams
  body: BodyDefinition | null
  issues: string[]
  manualLayer: { overrides: ManualOverride[]; name?: string; summary?: string; updatedAt?: string } | null
  requestDraft?: RequestDraft
  changeNote?: string
}

export interface ManualDirectory {
  id: string
  name: string
  description: string
  parentId?: string | null
  createdAt: string
}

export interface ManualDirectoryGroup extends ManualDirectory {
  interfaces: InterfaceSummary[]
}

export interface CatalogTree {
  modules: Array<{
    name: string
    packages: Array<{ name: string; displayName?: string; interfaces: InterfaceSummary[] }>
    interfaceCount: number
  }>
  manual: InterfaceSummary[]
  manualDirectories: ManualDirectoryGroup[]
}

export interface MavenModule {
  name: string
  path: string
}

export interface ScanScope {
  type: 'all' | 'directory' | 'modules'
  directory?: string
  modules?: string[]
}

export interface ScanCandidate {
  candidateId: string
  kind: 'new' | 'changed' | 'deleted'
  method: HttpMethod
  path: string
  name: string
  interfaceId?: string
  module?: string | null
  parseQuality?: ParseQuality
  diff?: string[]
  affectedCaseCount?: number
}

export interface ScanSummary {
  newCount: number
  changedCount: number
  deletedCount: number
  uncomparedModules: string[]
}

export interface ScanResult {
  scanId: string
  projectId: string
  scope: ScanScope
  summary: ScanSummary
  candidates: ScanCandidate[]
}

export interface ScanRunSummary {
  id: string
  scope: ScanScope
  startedAt: string
  finishedAt: string
  status: 'success' | 'cancelled' | 'failed'
  summary: ScanSummary
  parserVersion: string
}


export type RequestBodyType = 'none' | 'raw' | 'form-data' | 'urlencoded' | 'binary'

export interface RequestDraft {
  requestMethod?: HttpMethod
  requestUrl?: string
  pathParams: Record<string, string>
  query: ParamRow[]
  headers: ParamRow[]
  cookies: ParamRow[]
  bodyType: RequestBodyType
  bodyFormat?: 'json' | 'text'
  bodyRaw: string
  formRows?: ParamRow[]
  binaryFilePath?: string
  binaryFileName?: string
  fieldDescriptions?: Record<string, string>
  fieldDescriptionMeta?: Record<string, AIMeta>
}

export interface EffectiveParamRow extends ParamRow {
  source: 'global' | 'env' | 'interface' | 'auto'
  overrides: number
}

export interface EffectiveParams {
  query: EffectiveParamRow[]
  headers: EffectiveParamRow[]
  cookies: EffectiveParamRow[]
  bodyText: string
}

export interface SendResult {
  clientRequestId: string
  status: number
  statusText: string
  headers: Array<[string, string]>
  bodyText: string
  bodyTruncated: boolean
  sizeBytes: number
  totalMs: number
  finalUrl: string
}

export interface EnvironmentInput {
  name: string
  baseUrl: string
  timeoutMs?: number
}


export interface CaseRequestSnapshot extends RequestDraft {
  method: HttpMethod
  path: string
  baseUrl: string
  envName: string
}

export interface CaseAIMeta extends AIMeta {
  scenario?: AICaseScenario
}

export interface CaseSummary {
  id: string
  name: string
  apiId: string
  method: HttpMethod
  path: string
  interfaceName: string
  envId: string
  envName: string
  tags: string[]
  savedAt: string
  updatedAt: string
  interfaceExists: boolean
  interfaceChanged: boolean
  interfaceStatus: InterfaceStatus | null
  envExists: boolean
  aiMeta?: CaseAIMeta
}

export interface CaseDetail extends CaseSummary {
  note: string
  baseUrl: string
  requestSnapshot: CaseRequestSnapshot
}

export interface CreateCaseInput {
  projectId: string
  interfaceId: string
  envId: string
  name: string
  tags?: string[]
  note?: string
  draft: RequestDraft
  aiMeta?: CaseAIMeta
}

export interface UpdateCaseInput {
  projectId: string
  caseId: string
  patch: { name?: string; tags?: string[]; note?: string }
}


export interface ResponseExample {
  id: string
  projectId: string
  apiId: string
  name: string
  status: number
  headers: Array<[string, string]>
  body: string
  truncated: boolean
  sourceCaseId?: string
  fieldDescriptions?: Record<string, string>
  fieldDescriptionMeta?: Record<string, AIMeta>
  savedAt: string
}


export interface ExportResult {
  saved: boolean
  path?: string
}


export interface DocProjectFilter {
  name?: string
  method?: HttpMethod
  path?: string
  status?: InterfaceStatus
  module?: string
}

export interface DocProjectOptions {
  projectId: string
  scope: 'active' | 'all'
  includeManual: boolean
  envId?: string
  filter?: DocProjectFilter
  limit?: number
  offset?: number
}

export interface FeelpostApi {
  app: {
    getInfo(): Promise<Result<AppInfo>>
    setZoomFactor(factor: number): Promise<Result<void>>
  }
  settings: {
    get(): Promise<Result<Preferences>>
    update(patch: Partial<Preferences>): Promise<Result<Preferences>>
  }
  ai: {
    getConfig(): Promise<Result<AIConfigPublic>>
    revealApiKey(): Promise<Result<{ apiKey: string }>>
    updateConfig(input: AIConfig & { apiKey?: string | null }): Promise<Result<AIConfigPublic>>
    testConnection(): Promise<Result<{ latencyMs: number }>>
    listModels(): Promise<Result<string[]>>
    previewContext(input: AIContextInput): Promise<Result<AIContextPreview>>
    generate(input: AIGenerateInput): Promise<Result<{ requestId: string }>>
    cancel(requestId: string): Promise<Result<{ cancelled: boolean }>>
    importCases(input: AIImportCasesInput): Promise<Result<CaseSummary[]>>
    onStream(listener: (payload: AIStreamPayload) => void): () => void
    onCompleted(listener: (payload: AICompletedPayload) => void): () => void
    onFailed(listener: (payload: AIFailedPayload) => void): () => void
    onCancelled(listener: (payload: { requestId: string }) => void): () => void
  }
  dialog: {
    chooseDirectory(): Promise<Result<{ path: string } | null>>
    chooseFile(): Promise<Result<{ path: string; name: string } | null>>
  }
  shell: {
    openPath(path: string): Promise<Result<void>>
  }
  project: {
    list(): Promise<Result<ProjectSummary[]>>
    get(projectId: string): Promise<Result<ProjectDetail>>
    create(input: CreateProjectInput): Promise<Result<ProjectDetail>>
    update(input: UpdateProjectInput): Promise<Result<ProjectDetail>>
    remove(projectId: string): Promise<Result<void>>
    validateDirectory(path: string): Promise<Result<DirectoryCheck>>
    listModules(projectId: string): Promise<Result<MavenModule[]>>
    getGlobals(projectId: string): Promise<Result<EnvironmentParams>>
    updateGlobals(projectId: string, params: EnvironmentParams): Promise<Result<EnvironmentParams>>
  }
  scan: {
    start(input: { projectId: string; scope: ScanScope }): Promise<Result<{ scanId: string }>>
    cancel(scanId: string): Promise<Result<{ cancelled: boolean }>>
    getResult(scanId: string): Promise<Result<ScanResult>>
    apply(input: { scanId: string; candidateIds: string[] }): Promise<Result<{ applied: ScanSummary }>>
    getLastRun(projectId: string): Promise<Result<ScanRunSummary | null>>
    onProgress(listener: (payload: { scanId: string; phase: string; message: string; percent?: number }) => void): () => void
    onCompleted(listener: (payload: { scanId: string; summary: ScanSummary }) => void): () => void
    onFailed(listener: (payload: { scanId: string; error: AppError }) => void): () => void
    onCancelled(listener: (payload: { scanId: string }) => void): () => void
  }
  env: {
    list(projectId: string): Promise<Result<Environment[]>>
    create(projectId: string, input: EnvironmentInput): Promise<Result<Environment>>
    update(projectId: string, envId: string, patch: Partial<Environment>): Promise<Result<Environment>>
    remove(projectId: string, envId: string): Promise<Result<void>>
    setDefault(projectId: string, envId: string): Promise<Result<Environment[]>>
    preview(input: {
      projectId: string
      envId: string
      interfaceId?: string
      draft: RequestDraft
    }): Promise<Result<EffectiveParams>>
  }
  doc: {
    exportInterface(input: { projectId: string; interfaceId: string; envId?: string }): Promise<Result<ExportResult>>
    exportCase(input: { projectId: string; caseId: string }): Promise<Result<ExportResult>>
    previewProject(input: DocProjectOptions): Promise<Result<{
      markdown: string
      total: number
      offset: number
      hasMore: boolean
      nextOffset: number
    }>>
    exportProject(input: DocProjectOptions): Promise<Result<ExportResult>>
    exportCases(input: { projectId: string; tags?: string[]; caseIds?: string[] }): Promise<Result<ExportResult>>
    saveMarkdown(input: { markdown: string; suggestedName: string }): Promise<Result<ExportResult>>
  }
  example: {
    list(projectId: string, interfaceId: string): Promise<Result<ResponseExample[]>>
    save(input: {
      projectId: string
      interfaceId: string
      name: string
      response: { status: number; statusText?: string; headers: Array<[string, string]>; bodyText: string; truncated?: boolean }
      sourceCaseId?: string
    }): Promise<Result<ResponseExample>>
    update(projectId: string, exampleId: string, name: string): Promise<Result<ResponseExample>>
    updateFields(
      projectId: string,
      exampleId: string,
      descriptions: Record<string, string>,
      fieldDescriptionMeta?: Record<string, AIMeta>
    ): Promise<Result<ResponseExample>>
    remove(projectId: string, exampleId: string): Promise<Result<void>>
  }
  case: {
    list(projectId: string, filter?: { tag?: string; keyword?: string }): Promise<Result<CaseSummary[]>>
    get(projectId: string, caseId: string): Promise<Result<CaseDetail>>
    create(input: CreateCaseInput): Promise<Result<CaseDetail>>
    update(input: UpdateCaseInput): Promise<Result<CaseDetail>>
    duplicate(input: { projectId: string; caseId: string; name?: string }): Promise<Result<CaseDetail>>
    remove(projectId: string, caseId: string): Promise<Result<void>>
    removeTags(projectId: string, tags: string[]): Promise<Result<{ deleted: number }>>
  }
  request: {
    send(input: {
      projectId: string
      envId: string
      interfaceId: string
      draft: RequestDraft
      clientRequestId: string
    }): Promise<Result<SendResult>>
    cancel(clientRequestId: string): Promise<Result<{ cancelled: boolean }>>
    buildCurl(input: {
      projectId: string
      envId: string
      interfaceId: string
      draft: RequestDraft
    }): Promise<Result<{ curl: string }>>
  }
  catalog: {
    list(projectId: string): Promise<Result<CatalogTree>>
    get(projectId: string, interfaceId: string): Promise<Result<InterfaceDetail>>
    updateManual(input: {
      projectId: string
      interfaceId: string
      manualLayer: { overrides: ManualOverride[]; name?: string; summary?: string }
      requestDraft?: RequestDraft
    }): Promise<Result<InterfaceDetail>>
    confirmChange(projectId: string, interfaceId: string): Promise<Result<InterfaceSummary>>
    restore(projectId: string, interfaceId: string): Promise<Result<InterfaceSummary>>
    createManual(input: {
      projectId: string
      method: HttpMethod
      path: string
      name: string
      summary?: string
      directoryId?: string
    }): Promise<Result<InterfaceDetail>>
    createDirectory(input: { projectId: string; name: string; description?: string; parentId?: string | null }): Promise<Result<ManualDirectory>>
    updateDirectory(input: { projectId: string; directoryId: string; name?: string; description?: string }): Promise<Result<ManualDirectory>>
    moveDirectory(input: { projectId: string; directoryId: string; parentId?: string | null }): Promise<Result<ManualDirectory>>
    deleteDirectory(projectId: string, directoryId: string): Promise<Result<void>>
    copyDirectory(input: { projectId: string; directoryId: string; name?: string }): Promise<Result<ManualDirectory>>
    moveInterface(input: { projectId: string; interfaceId: string; directoryId?: string | null }): Promise<Result<InterfaceDetail>>
    renamePackage(input: { projectId: string; packageName: string; label: string | null }): Promise<Result<void>>
    cloneInterface(input: { projectId: string; interfaceId: string }): Promise<Result<InterfaceDetail>>
    deleteInterface(projectId: string, interfaceId: string): Promise<Result<void>>
  }
}
