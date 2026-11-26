import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OpenAICompatibleProvider } from '../../src/main/services/ai-provider'

describe('OpenAICompatibleProvider', () => {
  let server: http.Server
  let baseUrl = ''

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/v1/chat/completions' && req.headers.authorization === 'Bearer demo') {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: {"choices":[{"delta":{"content":"你"}}]}\n\n')
        res.write('data: {"choices":[{"delta":{"content":"好"}}]}\n\n')
        res.write('data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n')
        res.end('data: [DONE]\n\n')
        return
      }
      if (req.url === '/v1/chat/completions') {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end('{"error":"auth"}')
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('streams SSE deltas and usage', async () => {
    const deltas: string[] = []
    const result = await new OpenAICompatibleProvider().chat(
      { baseUrl, apiKey: 'demo', model: 'demo-model', timeoutMs: 10000 },
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      (delta) => deltas.push(delta)
    )
    expect(deltas.join('')).toBe('你好')
    expect(result.content).toBe('你好')
    expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 })
  })

  it('maps unauthorized responses to AI_AUTH', async () => {
    await expect(new OpenAICompatibleProvider().chat(
      { baseUrl, apiKey: 'wrong', model: 'demo-model', timeoutMs: 10000 },
      [{ role: 'user', content: 'hello' }],
      new AbortController().signal,
      () => undefined
    )).rejects.toMatchObject({ code: 'AI_AUTH' })
  })
})
