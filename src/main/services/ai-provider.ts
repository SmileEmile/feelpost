import { request } from 'undici'
import type { AIUsage } from '@shared/contract'
import { AppException } from '../errors'

export interface AIProviderConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export interface AIProviderMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIProviderResult {
  content: string
  usage?: AIUsage
}

export interface AIProvider {
  listModels?(config: AIProviderConfig, signal: AbortSignal): Promise<string[]>
  chat(
    config: AIProviderConfig,
    messages: AIProviderMessage[],
    signal: AbortSignal,
    onDelta: (delta: string) => void,
    options?: ChatOptions
  ): Promise<AIProviderResult>
}

interface ChatOptions {
  stream?: boolean
  maxTokens?: number
}

function endpointOf(baseUrl: string): string {
  const raw = baseUrl.trim()
  if (!raw) throw new AppException('AI_NOT_CONFIGURED', '请先配置 AI Base URL。')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AppException('VALIDATION', 'AI Base URL 不合法。')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppException('VALIDATION', 'AI Base URL 只支持 http / https。')
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
  if (url.protocol === 'http:' && !loopback) {
    throw new AppException('VALIDATION', 'AI Base URL 必须使用 HTTPS；本地 Ollama 可使用 localhost HTTP。')
  }
  return `${raw.replace(/\/+$/, '')}/chat/completions`
}

function modelsEndpointOf(baseUrl: string): string {
  const chat = endpointOf(baseUrl)
  return chat.replace(/\/chat\/completions$/, '/models')
}

function usageOf(raw: unknown): AIUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Record<string, unknown>
  const promptTokens = Number(value.prompt_tokens ?? value.promptTokens ?? 0)
  const completionTokens = Number(value.completion_tokens ?? value.completionTokens ?? 0)
  const totalTokens = Number(value.total_tokens ?? value.totalTokens ?? promptTokens + completionTokens)
  if (![promptTokens, completionTokens, totalTokens].every(Number.isFinite)) return undefined
  return { promptTokens, completionTokens, totalTokens }
}

function messageOf(payload: unknown): { content: string; usage?: AIUsage } {
  if (!payload || typeof payload !== 'object') {
    throw new AppException('AI_INVALID_OUTPUT', 'AI 返回格式不正确。')
  }
  const root = payload as Record<string, unknown>
  const choices = Array.isArray(root.choices) ? root.choices : []
  const first = choices[0] as Record<string, unknown> | undefined
  const message = first?.message as Record<string, unknown> | undefined
  const delta = first?.delta as Record<string, unknown> | undefined
  const value = message?.content ?? delta?.content
  return {
    content: typeof value === 'string' ? value : '',
    usage: usageOf(root.usage)
  }
}

/**
 * Minimal OpenAI-compatible client. It deliberately has no provider SDK and
 * keeps the API key inside the main process.
 */
export class OpenAICompatibleProvider implements AIProvider {
  async listModels(config: AIProviderConfig, signal: AbortSignal): Promise<string[]> {
    const controller = new AbortController()
    let timedOut = false
    const abort = (): void => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, Math.max(10000, Math.min(config.timeoutMs, 20000)))

    try {
      const response = await request(modelsEndpointOf(config.baseUrl), {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
        },
        signal: controller.signal
      })
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.body.dump().catch(() => undefined)
        if (response.statusCode === 401 || response.statusCode === 403) {
          throw new AppException('AI_AUTH', 'AI 认证失败，请检查 API Key。', { status: response.statusCode })
        }
        throw new AppException('AI_NETWORK', `获取模型列表失败：AI 服务返回 ${response.statusCode}。`, { status: response.statusCode }, response.statusCode >= 500)
      }
      const payload = JSON.parse(await response.body.text()) as { data?: Array<{ id?: unknown }>; models?: Array<{ id?: unknown }> }
      const raw = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : []
      const models = [...new Set(raw.map((item) => typeof item?.id === 'string' ? item.id : '').filter(Boolean))].sort()
      if (models.length === 0) throw new AppException('AI_INVALID_OUTPUT', '服务商没有返回可用模型。')
      return models
    } catch (error) {
      if (error instanceof AppException) throw error
      if (signal.aborted || controller.signal.aborted) {
        if (signal.aborted) throw new AppException('AI_CANCELLED', '获取模型列表已取消。')
        if (timedOut) throw new AppException('AI_TIMEOUT', '获取模型列表超时。', undefined, true)
      }
      throw new AppException('AI_NETWORK', '无法获取模型列表，请检查网络、Base URL 与 API Key。', undefined, true)
    } finally {
      signal.removeEventListener('abort', abort)
      clearTimeout(timer)
    }
  }

  async chat(
    config: AIProviderConfig,
    messages: AIProviderMessage[],
    signal: AbortSignal,
    onDelta: (delta: string) => void,
    options: ChatOptions = {}
  ): Promise<AIProviderResult> {
    if (!config.model.trim()) throw new AppException('AI_NOT_CONFIGURED', '请先配置 AI 模型名。')
    const endpoint = endpointOf(config.baseUrl)
    const controller = new AbortController()
    let timedOut = false
    let timer: NodeJS.Timeout | undefined
    const abort = (): void => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, Math.max(10000, config.timeoutMs))

    try {
      const response = await request(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream, application/json',
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: options.stream !== false,
          temperature: 0.2,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {})
        }),
        signal: controller.signal
      })

      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.body.dump().catch(() => undefined)
        if (response.statusCode === 401 || response.statusCode === 403) {
          throw new AppException('AI_AUTH', 'AI 认证失败，请检查 API Key。', { status: response.statusCode })
        }
        if (response.statusCode === 429) {
          throw new AppException('AI_RATE_LIMIT', 'AI 额度或频率受限，请稍后重试。', { status: response.statusCode })
        }
        throw new AppException(
          'AI_NETWORK',
          `AI 服务返回 ${response.statusCode}。`,
          { status: response.statusCode },
          response.statusCode >= 500
        )
      }

      const contentType = String(response.headers['content-type'] ?? '')
      if (!contentType.includes('text/event-stream')) {
        const parsed = JSON.parse(await response.body.text()) as unknown
        const result = messageOf(parsed)
        if (result.content) onDelta(result.content)
        return result
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let content = ''
      let usage: AIUsage | undefined
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (!data || data === '[DONE]') continue
          let payload: unknown
          try {
            payload = JSON.parse(data)
          } catch {
            throw new AppException('AI_INVALID_OUTPUT', 'AI 流式返回不是合法 JSON。')
          }
          const part = messageOf(payload)
          usage = part.usage ?? usage
          if (part.content) {
            content += part.content
            onDelta(part.content)
          }
        }
      }
      return { content, usage }
    } catch (error) {
      if (error instanceof AppException) throw error
      if (signal.aborted || controller.signal.aborted) {
        if (signal.aborted) throw new AppException('AI_CANCELLED', 'AI 生成已取消。')
        if (timedOut) throw new AppException('AI_TIMEOUT', 'AI 调用超时。', undefined, true)
      }
      throw new AppException('AI_NETWORK', '无法连接 AI 服务，请检查网络与 Base URL。', undefined, true)
    } finally {
      signal.removeEventListener('abort', abort)
      if (timer) clearTimeout(timer)
    }
  }
}
