import { existsSync, promises as fs } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { Language, Parser, type Node as SyntaxNode } from 'web-tree-sitter'
import type {
  BodyDefinition,
  HttpMethod,
  InterfaceParams,
  ParamField,
  ParseQuality
} from '@shared/contract'
import { paramsDigest } from '@core/rules/fingerprint'
import type { ScanOptions, ScannedInterface, ScannerResult } from './types'

const PARSER_VERSION = 'tree-sitter-java-0.23.5'

const METHOD_ANNOTATIONS: Record<string, HttpMethod> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  PatchMapping: 'PATCH',
  DeleteMapping: 'DELETE'
}

const SIMPLE_TYPES = new Set([
  'String',
  'Long',
  'long',
  'Integer',
  'int',
  'Boolean',
  'boolean',
  'Double',
  'double',
  'Float',
  'float',
  'BigDecimal',
  'Date',
  'LocalDate',
  'LocalDateTime',
  'UUID'
])

interface ClassField {
  name: string
  type: string
  required: boolean
  description: string
  children?: ParamField[]
}

interface ClassInfo {
  name: string
  packageName: string
  imports: string[]
  annotations: AnnotationInfo[]
  methods: MethodInfo[]
  fields: ClassField[]
}

interface AnnotationInfo {
  name: string
  value: string
  pairs: Record<string, string>
}

interface MethodInfo {
  name: string
  annotations: AnnotationInfo[]
  params: ParamInfo[]
  returnType: string
  javadoc: string
}

interface ParamInfo {
  name: string
  type: string
  annotations: AnnotationInfo[]
}

let parserPromise: Promise<Parser> | null = null

async function getParser(grammarPath: string): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      await Parser.init({ locateFile: () => join(dirname(grammarPath), 'tree-sitter.wasm') })
      const language = await Language.load(grammarPath)
      const parser = new Parser()
      parser.setLanguage(language)
      return parser
    })().catch((error) => {
      parserPromise = null
      throw error
    })
  }
  return parserPromise
}

function annotationsOf(node: SyntaxNode): AnnotationInfo[] {
  const modifiers = named(node).find((child) => child.type === 'modifiers')
  if (!modifiers) return []
  return named(modifiers)
    .filter((child) => child.type === 'annotation' || child.type === 'marker_annotation')
    .map((annotation) => {
      const name = annotation.childForFieldName('name')?.text ?? ''
      const args = annotation.childForFieldName('arguments') ?? named(annotation).find((c) => c.type === 'annotation_argument_list')
      let value = ''
      const pairs: Record<string, string> = {}
      if (args) {
        for (const item of named(args)) {
          if (item.type === 'string_literal') value = unquote(item.text)
          if (item.type === 'element_value_pair') {
            const key = item.childForFieldName('key')?.text ?? ''
            const val = item.childForFieldName('value')?.text ?? ''
            if (key) pairs[key] = unquote(val)
          }
        }
      }
      return { name, value, pairs }
    })
}

function annotationMatches(annotation: AnnotationInfo, ...names: string[]): boolean {
  return names.some((name) => annotation.name === name || annotation.name.endsWith(`.${name}`))
}

function annotationText(annotations: AnnotationInfo[], names: string[], keys: string[]): string {
  for (const annotation of annotations) {
    if (!annotationMatches(annotation, ...names)) continue
    for (const key of keys) {
      const value = annotation.pairs[key] ?? (key === 'value' ? annotation.value : '')
      if (value) return value
    }
  }
  return ''
}

function annotationRequired(annotations: AnnotationInfo[]): boolean {
  if (annotations.some((annotation) => annotationMatches(annotation, 'NotNull', 'NotBlank', 'NotEmpty'))) return true
  return annotations.some(
    (annotation) => annotationMatches(annotation, 'ApiModelProperty', 'Schema', 'ApiParam', 'Parameter') && annotation.pairs.required === 'true'
  )
}

function unquote(text: string): string {
  return text.replace(/^"(.*)"$/s, '$1')
}

function javadocAt(siblings: SyntaxNode[], index: number): string {
  for (let i = index - 1; i >= 0; i -= 1) {
    const sibling = siblings[i]
    if (sibling.type !== 'block_comment' && sibling.type !== 'line_comment') break
    if (sibling.type === 'block_comment' && sibling.text.startsWith('/**')) {
      const lines = sibling.text
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean)
      const description: string[] = []
      for (const line of lines) {
        if (line.startsWith('@')) break
        description.push(line)
      }
      return description.join(' ')
    }
  }
  return ''
}

function firstLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).filter(Boolean)[0] ?? ''
}

function named(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter((child): child is SyntaxNode => child !== null)
}

function field(node: SyntaxNode, name: string): SyntaxNode | null {
  return node.childForFieldName(name)
}

function printType(type: string): string {
  return type.replace(/\s+/g, '')
}

function baseType(type: string): string {
  const match = type.replace(/\[\]/g, '').match(/^(?:List|Set|Collection|Map|Optional)<\s*(.+?)\s*>$/)
  if (match) return match[1]
  return type.replace(/<.*>$/s, '').trim()
}

function isSimpleType(type: string): boolean {
  return SIMPLE_TYPES.has(baseType(type))
}

function joinPath(base: string, child: string): string {
  const parts = [base, child].filter(Boolean).map((part) => part.trim())
  if (parts.length === 0) return ''
  let joined = parts.join('/')
  joined = joined.replace(/\/+/g, '/')
  if (!joined.startsWith('/')) joined = '/' + joined
  if (joined.length > 1 && joined.endsWith('/')) joined = joined.slice(0, -1)
  return joined
}

function pathFromAnnotation(annotation: AnnotationInfo): string {
  return annotation.value || annotation.pairs.value || annotation.pairs.path || ''
}

function methodOfAnnotation(annotation: AnnotationInfo): HttpMethod | null {
  if (annotation.name === 'RequestMapping') {
    const raw = annotation.pairs.method ?? ''
    const match = raw.match(/RequestMethod\.(GET|POST|PUT|PATCH|DELETE)/)
    return (match?.[1] as HttpMethod) ?? null
  }
  return METHOD_ANNOTATIONS[annotation.name] ?? null
}

async function collectJavaFiles(root: string, scopeDir: string | undefined, excludes: string[], isCancelled?: () => boolean): Promise<string[]> {
  const files: string[] = []
  const stack = [scopeDir && scopeDir.startsWith(root) ? scopeDir : root]
  const skip = new Set([...excludes, 'node_modules', 'target', 'build', '.git', 'out', 'dist'])
  while (stack.length && files.length < 5000) {
    if (isCancelled?.()) break
    const current = stack.pop() as string
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(join(current, entry.name))
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        files.push(join(current, entry.name))
      }
    }
  }
  return files
}

function moduleOf(file: string, root: string): string {
  let current = dirname(file)
  while (current.startsWith(root) && current !== root) {
    if (existsSync(join(current, 'pom.xml')) || existsSync(join(current, 'build.gradle')) || existsSync(join(current, 'build.gradle.kts'))) {
      return basename(current)
    }
    current = dirname(current)
  }
  return basename(root)
}

function packageOf(root: SyntaxNode): string {
  const packageNode = named(root).find((node) => node.type === 'package_declaration')
  if (!packageNode) return ''
  const identifier = named(packageNode).find((node) => node.type === 'scoped_identifier' || node.type === 'identifier')
  return identifier?.text ?? ''
}

function importsOf(root: SyntaxNode): string[] {
  return named(root)
    .filter((node) => node.type === 'import_declaration')
    .map((node) => node.text.replace(/^import\s+(static\s+)?/, '').replace(/;$/, '').trim())
}

function fieldsOf(classNode: SyntaxNode): ClassField[] {
  const body = classNode.childForFieldName('body') ?? named(classNode).find((node) => node.type === 'class_body')
  if (!body) return []
  const fields: ClassField[] = []
  const members = named(body)
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]
    if (member.type !== 'field_declaration') continue
    const type = printType(field(member, 'type')?.text ?? '')
    const annotations = annotationsOf(member)
    const required = annotationRequired(annotations)
    const description =
      annotationText(annotations, ['ApiModelProperty'], ['value', 'name']) ||
      annotationText(annotations, ['Schema'], ['description', 'title']) ||
      firstLine(javadocAt(members, index))
    for (const declarator of named(member).filter((node) => node.type === 'variable_declarator')) {
      const name = field(declarator, 'name')?.text ?? ''
      if (name) fields.push({ name, type, required, description })
    }
  }
  return fields
}

function methodsOf(classNode: SyntaxNode): MethodInfo[] {
  const body = classNode.childForFieldName('body') ?? named(classNode).find((node) => node.type === 'class_body')
  if (!body) return []
  const methods: MethodInfo[] = []
  const members = named(body)
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]
    if (member.type !== 'method_declaration') continue
    const name = field(member, 'name')?.text ?? ''
    const returnType = printType(field(member, 'type')?.text ?? '')
    const annotations = annotationsOf(member)
    const javadoc = javadocAt(members, index)
    const paramsNode = field(member, 'parameters') ?? named(member).find((node) => node.type === 'formal_parameters')
    const params: ParamInfo[] = []
    if (paramsNode) {
      for (const param of named(paramsNode).filter((node) => node.type === 'formal_parameter')) {
        const paramType = printType(field(param, 'type')?.text ?? '')
        const paramName = field(param, 'name')?.text ?? ''
        if (paramName) params.push({ name: paramName, type: paramType, annotations: annotationsOf(param) })
      }
    }
    methods.push({ name, annotations, params, returnType, javadoc })
  }
  return methods
}

function buildFields(classInfo: ClassInfo | undefined, index: Map<string, ClassInfo>, depth: number): ParamField[] {
  if (!classInfo || depth > 2) return []
  const result: ParamField[] = []
  for (const item of classInfo.fields) {
    const node: ParamField = {
      location: 'body',
      path: item.name,
      name: item.name,
      type: item.type,
      required: item.required,
      description: item.description
    }
    const base = baseType(item.type)
    if (base !== item.type || !isSimpleType(item.type)) {
      const nested = index.get(base) ?? index.get(item.type)
      if (nested && depth < 2) {
        node.children = buildFields(nested, index, depth + 1).map((child) => ({
          ...child,
          path: `${item.name}.${child.path}`
        }))
      }
    }
    result.push(node)
  }
  return result
}

function paramLocation(annotations: AnnotationInfo[]): { location: 'path' | 'query' | 'header' | 'cookie'; required: boolean } | null {
  for (const annotation of annotations) {
    const required = annotation.pairs.required !== 'false' && !annotation.pairs.defaultValue
    if (annotation.name === 'PathVariable') return { location: 'path', required }
    if (annotation.name === 'RequestParam') return { location: 'query', required }
    if (annotation.name === 'RequestHeader') return { location: 'header', required }
    if (annotation.name === 'CookieValue') return { location: 'cookie', required }
  }
  return null
}

function isDynamicBodyType(type: string): boolean {
  const base = baseType(type)
  return (
    base.endsWith('JSONObject') ||
    base.endsWith('JsonNode') ||
    ['Object', 'JSONObject', 'JSONArray', 'JsonObject', 'Map', 'HashMap', 'LinkedHashMap'].includes(base) ||
    /^Map\s*</.test(type)
  )
}

function createBody(type: string, index: Map<string, ClassInfo>, issues: string[]): { body: BodyDefinition | null; quality: ParseQuality } {
  if (type.includes('MultipartFile')) {
    return { body: { type: 'multipart', fields: [] }, quality: 'partial' }
  }
  if (isDynamicBodyType(type)) {
    return { body: { type: 'json', fields: [] }, quality: 'full' }
  }
  const base = baseType(type)
  const classInfo = index.get(base)
  if (!classInfo) {
    issues.push(`未能解析请求体类型 ${type} 的字段`)
    return { body: { type: 'json', fields: [] }, quality: 'partial' }
  }
  return {
    body: { type: 'json', fields: buildFields(classInfo, index, 0) },
    quality: 'full'
  }
}

export async function scanProject(options: ScanOptions): Promise<ScannerResult> {
  const parser = await getParser(options.grammarPath)
  const root = options.sourceDir
  const files = await collectJavaFiles(root, options.scopeDirectory, options.excludePatterns, options.isCancelled)
  const issues: string[] = []
  const classes = new Map<string, ClassInfo>()
  const roots: Array<{ file: string; root: SyntaxNode; module: string; packageName: string }> = []
  const importsPerFile = new Map<string, string[]>()

  for (let i = 0; i < files.length; i += 1) {
    if (options.isCancelled?.()) break
    const file = files[i]
    options.onProgress?.(`解析 ${relative(root, file)}`, i + 1, files.length)
    let source = ''
    try {
      source = await fs.readFile(file, 'utf8')
    } catch (error) {
      issues.push(`读取失败：${relative(root, file)}`)
      continue
    }
    const tree = parser.parse(source)
    if (!tree) {
      issues.push(`解析失败：${relative(root, file)}`)
      continue
    }
    const treeRoot = tree.rootNode
    const packageName = packageOf(treeRoot)
    const imports = importsOf(treeRoot)
    importsPerFile.set(file, imports)
    roots.push({ file, root: treeRoot, module: moduleOf(file, root), packageName })
    for (const classNode of named(treeRoot).filter((node) => node.type === 'class_declaration')) {
      const name = field(classNode, 'name')?.text ?? ''
      if (!name) continue
      classes.set(name, {
        name,
        packageName,
        imports,
        annotations: annotationsOf(classNode),
        methods: methodsOf(classNode),
        fields: fieldsOf(classNode)
      })
    }
  }

  const interfaces: ScannedInterface[] = []
  const seen = new Map<string, ScannedInterface>()

  for (const entry of roots) {
    const classNode = named(entry.root).find((node) => node.type === 'class_declaration')
    if (!classNode) continue
    const className = field(classNode, 'name')?.text ?? ''
    const classInfo = classes.get(className)
    if (!classInfo) continue
    const isController = classInfo.annotations.some((annotation) => ['RestController', 'Controller'].includes(annotation.name))
    if (!isController) continue
    const baseMapping = classInfo.annotations.find((annotation) => annotation.name === 'RequestMapping')
    const basePath = baseMapping ? pathFromAnnotation(baseMapping) : ''

    for (const method of classInfo.methods) {
      const mapping = method.annotations.find((annotation) => methodOfAnnotation(annotation) !== null)
      if (!mapping) continue
      const httpMethod = methodOfAnnotation(mapping)
      if (!httpMethod) continue
      const path = joinPath(basePath, pathFromAnnotation(mapping))
      const key = `${httpMethod} ${path}`
      if (seen.has(key)) {
        issues.push(`重复接口：${key}（已保留第一个）`)
        continue
      }
      const params: InterfaceParams = { path: [], query: [], headers: [], cookies: [] }
      let body: BodyDefinition | null = null
      let quality: ParseQuality = 'full'
      const localIssues: string[] = []

      for (const param of method.params) {
        const bodyAnnotation = param.annotations.find((annotation) => ['RequestBody', 'RequestPart'].includes(annotation.name))
        if (bodyAnnotation) {
          if (param.type.includes('MultipartFile') || bodyAnnotation.name === 'RequestPart') {
            body = { type: 'multipart', fields: [{ location: 'body', path: param.name, name: param.name, type: 'File', required: true, description: annotationText(param.annotations, ['ApiParam'], ['value']) || firstLine(param.name) }] }
          } else {
            const created = createBody(param.type, classes, localIssues)
            body = created.body
            if (created.quality !== 'full') quality = 'partial'
          }
          continue
        }
        const located = paramLocation(param.annotations)
        if (located) {
          const bucket = located.location === 'header' ? params.headers : located.location === 'cookie' ? params.cookies : located.location === 'path' ? params.path : params.query
          bucket.push({
            location: located.location,
            path: param.name,
            name: param.name,
            type: param.type,
            required: located.required,
            description: annotationText(param.annotations, ['ApiParam'], ['value']) || annotationText(param.annotations, ['Parameter'], ['description']),
            defaultValue: param.annotations.find((annotation) => annotation.pairs.defaultValue)?.pairs.defaultValue
          })
          continue
        }
        if (isSimpleType(param.type)) {
          params.query.push({
            location: 'query',
            path: param.name,
            name: param.name,
            type: param.type,
            required: true,
            description: annotationText(param.annotations, ['ApiParam'], ['value']) || annotationText(param.annotations, ['Parameter'], ['description'])
          })
        } else {
          quality = 'partial'
          localIssues.push(`未识别的参数 ${param.name} (${param.type})`)
        }
      }

      const flatParams = [
        ...params.path,
        ...params.query,
        ...params.headers,
        ...params.cookies,
        ...(body?.fields ?? [])
      ].map((param) => ({
        location: param.location,
        name: param.path,
        type: param.type,
        required: param.required
      }))

      const annotationName =
        annotationText(method.annotations, ['ApiOperation'], ['value']) ||
        annotationText(method.annotations, ['Operation'], ['summary']) ||
        annotationText(method.annotations, ['SysLog'], ['value'])
      const docName = firstLine(method.javadoc)
      const itemName = annotationName || docName || method.name
      const nameSource: ScannedInterface['nameSource'] = annotationName ? 'annotation' : docName ? 'javadoc' : 'method'
      const itemSummary =
        annotationText(method.annotations, ['ApiOperation'], ['notes']) ||
        annotationText(method.annotations, ['Operation'], ['description']) ||
        docName

      const item: ScannedInterface = {
        method: httpMethod,
        path,
        name: itemName,
        nameSource,
        summary: itemSummary,
        controller: classInfo.name,
        module: entry.module,
        packageName: entry.packageName,
        params,
        body,
        parseQuality: localIssues.length ? 'partial' : quality,
        issues: localIssues,
        sourceFile: relative(root, entry.file),
        paramsDigest: paramsDigest(flatParams)
      }
      seen.set(key, item)
      interfaces.push(item)
    }
  }

  return { interfaces, fileCount: files.length, issues: [...issues, ...interfaces.flatMap((item) => item.issues)] }
}

export const scanEngineInfo = {
  name: 'tree-sitter-java',
  version: PARSER_VERSION
}
