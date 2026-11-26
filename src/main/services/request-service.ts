import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { Agent, ProxyAgent, request } from 'undici'
import type {
  EffectiveParams,
  Environment,
  HttpMethod,
  RequestDraft,
  SendResult
} from '@shared/contract'
import { mergeParams, type Merged } from '@core/rules/merge'
import { AppException } from '../errors'
import { ProjectService } from './project-service'
import { CatalogService, type StoredInterface } from './catalog-service'
import { SettingsService } from './settings-service'

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
}

const MAX_BODY_BYTES = 5 * 1024 * 1024

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-auth-token', 'token'])

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '***' : value
  }
  return result
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…（共 ${text.length} 字符）` : text
}

function normalizeBaseUrl(raw: string): string {
  const value = raw.trim()
  const normalized = /^https?:\/\//i.test(value) ? value : `http://${value}`
  try {
    const url = new URL(normalized)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol')
  } catch {
    throw new AppException('VALIDATION', '环境前置 URL 不合法，请使用 http:// 或 https:// 开头的地址。')
  }
  return normalized
}

function statusText(code: number): string {
  return STATUS_TEXT[code] ?? ''
}

function singleQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

function formUrlEncoded(rows: NonNullable<RequestDraft['formRows']>): string {
  return rows
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`)
    .join('&')
}

function binaryContentType(fileName: string): string {
  const extension = extname(fileName).toLowerCase()
  const types: Record<string, string> = {
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip'
  }
  return types[extension] ?? 'application/octet-stream'
}

async function multipartBody(rows: NonNullable<RequestDraft['formRows']>, boundary: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  for (const row of rows) {
    if (!row.enabled || !row.key.trim()) continue
    if (row.kind === 'file') {
      if (!row.filePath) throw new AppException('VALIDATION', `表单字段「${row.key}」还没有选择文件。`)
      let data: Buffer
      try {
        data = await readFile(row.filePath)
      } catch {
        throw new AppException('IO', `无法读取文件：${row.filePath}`)
      }
      const fileName = row.fileName || basename(row.filePath)
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${row.key}"; filename="${fileName}"\r\nContent-Type: ${binaryContentType(fileName)}\r\n\r\n`))
      chunks.push(data)
      chunks.push(Buffer.from('\r\n'))
    } else {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${row.key}"\r\n\r\n${row.value}\r\n`))
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return Buffer.concat(chunks)
}

interface PreparedRequest {
  method: HttpMethod
  url: string
  headers: Record<string, string>
  body?: string | Buffer
  effective: EffectiveParams
  item: StoredInterface
  env: Environment
}

export class RequestService {
  private readonly cancels = new Map<string, AbortController>()
  private readonly projects: ProjectService
  private readonly catalog: CatalogService
  private readonly settings: SettingsService
  private readonly dataDir: string

  constructor(dataDir: string) {
    this.dataDir = dataDir
    this.projects = new ProjectService(dataDir)
    this.catalog = new CatalogService(dataDir)
    this.settings = new SettingsService(dataDir)
  }

  private async log(level: 'info' | 'error', message: string, payload: Record<string, unknown>): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      const output = level === 'error' ? console.error : console.info
      output(`[FeelPost:http] ${message}`, payload)
    }
    try {
      const prefs = await this.settings.get()
      if (!prefs.debugLogging) return
    } catch {
      return
    }
    const line = `${new Date().toISOString()} [${level}] ${message} ${JSON.stringify(payload)}\n`
    await mkdir(join(this.dataDir, 'logs'), { recursive: true })
      .then(() => appendFile(join(this.dataDir, 'logs', 'requests.log'), line))
      .catch(() => undefined)
  }

  private async prepare(projectId: string, envId: string, interfaceId: string, draft: RequestDraft): Promise<PreparedRequest> {
    const project = await this.projects.get(projectId)
    const env = project.environments.find((item) => item.id === envId)
    if (!env) throw new AppException('NOT_FOUND', '环境不存在。')
    const item = await this.catalog.getStored(projectId, interfaceId)
    if (item.status === 'archived') throw new AppException('UNSUPPORTED', '归档接口不能发送请求。')

    const merged: Merged = mergeParams({
      global: project.globalParams,
      env: env.params,
      draft: {
        query: draft.query,
        headers: draft.headers,
        cookies: draft.cookies,
        bodyRaw: draft.bodyRaw
      }
    })

    const headers: Record<string, string> = {}
    for (const row of merged.headers) headers[row.key] = row.value
    const hasAccept = Object.keys(headers).some((key) => key.toLowerCase() === 'accept')
    if (!hasAccept) headers.Accept = 'application/json'

    let body: string | Buffer | undefined
    let autoContentType = ''
    if (draft.bodyType === 'raw') {
      body = merged.bodyText || undefined
      autoContentType = draft.bodyFormat === 'text' ? 'text/plain' : 'application/json'
    } else if (draft.bodyType === 'urlencoded') {
      body = formUrlEncoded(draft.formRows ?? []) || undefined
      autoContentType = 'application/x-www-form-urlencoded'
    } else if (draft.bodyType === 'form-data') {
      const boundary = `----feelpost${Date.now().toString(16)}`
      body = await multipartBody(draft.formRows ?? [], boundary)
      autoContentType = `multipart/form-data; boundary=${boundary}`
    } else if (draft.bodyType === 'binary') {
      if (!draft.binaryFilePath) throw new AppException('VALIDATION', '请先选择二进制文件。')
      try {
        body = await readFile(draft.binaryFilePath)
      } catch {
        throw new AppException('IO', `无法读取文件：${draft.binaryFilePath}`)
      }
      autoContentType = binaryContentType(draft.binaryFileName || draft.binaryFilePath)
    }

    if (body && (!Buffer.isBuffer(body) || body.length > 0)) {
      const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
      if (!hasContentType && autoContentType) headers['Content-Type'] = autoContentType
    }
    if (merged.cookies.length > 0) {
      const hasCookie = Object.keys(headers).some((key) => key.toLowerCase() === 'cookie')
      if (!hasCookie) headers.Cookie = merged.cookies.map((row) => `${row.key}=${row.value}`).join('; ')
    }

    const requestTarget = draft.requestUrl?.trim() || item.path
    const absolute = /^\/?https?:\/\//i.test(requestTarget)
    const normalizedTarget = absolute ? requestTarget.replace(/^\/(?=https?:\/\/)/i, '') : requestTarget
    const path = normalizedTarget.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(draft.pathParams[key] ?? ''))
    let url: URL
    try {
      url = absolute
        ? new URL(path)
        : new URL(joinUrl(normalizeBaseUrl(env.baseUrl), path))
    } catch {
      throw new AppException('VALIDATION', '请求地址不合法，请输入路径或完整的 http(s) URL。')
    }
    merged.query.forEach((row) => {
      if (row.value !== '') url.searchParams.append(row.key, row.value)
    })

    return {
      method: draft.requestMethod ?? item.method,
      url: url.toString(),
      headers,
      body: body && (!Buffer.isBuffer(body) || body.length > 0) ? body : undefined,
      effective: {
        query: merged.query,
        headers: merged.headers,
        cookies: merged.cookies,
        bodyText: merged.bodyText
      },
      item,
      env
    }
  }

  async preview(projectId: string, envId: string, interfaceId: string, draft: RequestDraft): Promise<EffectiveParams> {
    const prepared = await this.prepare(projectId, envId, interfaceId, draft)
    return { ...prepared.effective, bodyText: typeof prepared.body === 'string' ? prepared.body : '' }
  }

  async buildCurl(projectId: string, envId: string, interfaceId: string, draft: RequestDraft): Promise<{ curl: string }> {
    const prepared = await this.prepare(projectId, envId, interfaceId, draft)
    const lines = [`curl -X ${prepared.method} ${singleQuote(prepared.url)}`]
    for (const [key, value] of Object.entries(prepared.headers)) {
      lines.push(`  -H ${singleQuote(`${key}: ${value}`)}`)
    }
    if (draft.bodyType === 'form-data') {
      for (const row of (draft.formRows ?? []).filter((item) => item.enabled && item.key.trim())) {
        const value = row.kind === 'file'
          ? `@${row.filePath ?? ''}`
          : row.value
        lines.push(`  -F ${singleQuote(`${row.key}=${value}`)}`)
      }
    } else if (draft.bodyType === 'binary') {
      if (draft.binaryFilePath) lines.push(`  --data-binary ${singleQuote(`@${draft.binaryFilePath}`)}`)
    } else if (prepared.body) {
      lines.push(`  --data-raw ${singleQuote(String(prepared.body))}`)
    }
    return { curl: lines.join(' \\\n') }
  }

  async send(
    input: {
      projectId: string
      envId: string
      interfaceId: string
      draft: RequestDraft
      clientRequestId: string
    }
  ): Promise<SendResult> {
    const prepared = await this.prepare(input.projectId, input.envId, input.interfaceId, input.draft)
    const controller = new AbortController()
    this.cancels.set(input.clientRequestId, controller)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, prepared.env.timeoutMs)

    const dispatcher = prepared.env.proxy
      ? new ProxyAgent(prepared.env.proxy)
      : new Agent({ connect: { rejectUnauthorized: prepared.env.verifyTls } })

    const startedAt = Date.now()
    const startedLog = {
      method: prepared.method,
      url: prepared.url,
      headers: redactHeaders(prepared.headers),
      body: typeof prepared.body === 'string'
        ? truncate(prepared.body, 4000)
        : prepared.body
          ? `<binary ${prepared.body.byteLength} bytes>`
          : undefined,
      env: prepared.env.name
    }
    void this.log('info', '→ 请求', startedLog)
    try {
      const response = await request(prepared.url, {
        method: prepared.method,
        headers: prepared.headers,
        body: prepared.body,
        dispatcher,
        signal: controller.signal,
        headersTimeout: prepared.env.timeoutMs,
        bodyTimeout: prepared.env.timeoutMs
      })

      const chunks: Buffer[] = []
      let size = 0
      let truncated = false
      for await (const chunk of response.body) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        if (size + buffer.byteLength > MAX_BODY_BYTES) {
          const remain = MAX_BODY_BYTES - size
          if (remain > 0) chunks.push(buffer.subarray(0, remain))
          size = MAX_BODY_BYTES
          truncated = true
          break
        }
        chunks.push(buffer)
        size += buffer.byteLength
      }

      const headerPairs: Array<[string, string]> = []
      for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) headerPairs.push([key, value.join(', ')])
        else if (value !== undefined) headerPairs.push([key, String(value)])
      }

      const result = {
        clientRequestId: input.clientRequestId,
        status: response.statusCode,
        statusText: statusText(response.statusCode),
        headers: headerPairs,
        bodyText: Buffer.concat(chunks).toString('utf8'),
        bodyTruncated: truncated,
        sizeBytes: size,
        totalMs: Date.now() - startedAt,
        finalUrl: prepared.url
      }
      void this.log('info', '← 响应', {
        method: prepared.method,
        url: prepared.url,
        status: result.status,
        totalMs: result.totalMs,
        sizeBytes: result.sizeBytes,
        bodyTruncated: result.bodyTruncated
      })
      return result
    } catch (error) {
      const mapped = this.mapError(error, timedOut, controller.signal.aborted, prepared.url)
      void this.log('error', '✕ 请求失败', {
        method: prepared.method,
        url: prepared.url,
        code: mapped.code,
        message: mapped.message,
        details: mapped.details
      })
      throw mapped
    } finally {
      clearTimeout(timer)
      this.cancels.delete(input.clientRequestId)
      await dispatcher.close().catch(() => undefined)
    }
  }

  cancel(clientRequestId: string): { cancelled: boolean } {
    const controller = this.cancels.get(clientRequestId)
    if (!controller) return { cancelled: false }
    controller.abort()
    return { cancelled: true }
  }

  private mapError(error: unknown, timedOut: boolean, aborted: boolean, url: string): AppException {
    const err = error as NodeJS.ErrnoException & { cause?: { code?: string; message?: string }; message?: string }
    const code = err.code ?? err.cause?.code ?? ''
    if (timedOut) return new AppException('TIMEOUT', '请求超时，可在环境设置中调大超时时间。', { code, url }, true)
    if (aborted) return new AppException('CANCELLED', '请求已取消。')
    if (['ERR_INVALID_URL', 'ERR_UNESCAPED_CHARACTERS'].includes(code)) {
      return new AppException('VALIDATION', `请求 URL 不合法：${url}`, { code, url })
    }
    if (
      code.startsWith('CERT_') ||
      code.startsWith('ERR_TLS') ||
      ['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)
    ) {
      return new AppException('TLS', `证书校验失败：${err.message ?? code}。可在当前环境关闭证书校验后重试。`, { code, url })
    }
    if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET', 'UND_ERR_SOCKET', 'UND_ERR_CLOSED'].includes(code)) {
      return new AppException('NETWORK', `无法连接到目标服务：${err.message ?? code}（请求地址：${url}）`, { code, url }, true)
    }
    if (['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ETIMEDOUT'].includes(code)) {
      return new AppException('TIMEOUT', `请求超时：${err.message ?? code}（请求地址：${url}）`, { code, url }, true)
    }
    const detail = err.message || err.cause?.message || code || '未知错误'
    return new AppException('NETWORK', `请求失败：${detail}${code ? `（${code}）` : ''}（请求地址：${url}）`, { code, url, message: detail }, true)
  }
}
