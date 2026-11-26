import type {
  BodyDefinition,
  HttpMethod,
  InterfaceParams,
  ParamField,
  ParseQuality
} from '@shared/contract'

export interface ScannedInterface {
  method: HttpMethod
  path: string
  name: string
  nameSource: 'annotation' | 'javadoc' | 'method'
  summary: string
  controller: string
  module: string | null
  packageName: string | null
  params: InterfaceParams
  body: BodyDefinition | null
  parseQuality: ParseQuality
  issues: string[]
  sourceFile: string
  paramsDigest: string
}

export interface ScanOptions {
  sourceDir: string
  excludePatterns: string[]
  scopeDirectory?: string
  onProgress?: (message: string, processed: number, total: number) => void
  isCancelled?: () => boolean
  grammarPath: string
}

export interface ScannerResult {
  interfaces: ScannedInterface[]
  fileCount: number
  issues: string[]
}

export type { ParamField }
