import { request } from 'undici'
import type { UpdateInfo } from '@shared/contract'
import { AppException } from '../errors'

const RELEASES_API = 'https://api.github.com/repos/smileemile/feelpost/releases/latest'
const RELEASES_PAGE = 'https://github.com/smileemile/feelpost/releases'

export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '').split(/[+\-]/)[0]
}

export function isNewerVersion(latest: string, current: string): boolean {
  const left = normalizeVersion(latest).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = normalizeVersion(current).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0
    const b = right[index] ?? 0
    if (a !== b) return a > b
  }
  return false
}

export class UpdateService {
  private cached: { at: number; data: UpdateInfo } | null = null

  constructor(private readonly currentVersion: string) {}

  async check(): Promise<UpdateInfo> {
    if (this.cached && Date.now() - this.cached.at < 5 * 60 * 1000) return this.cached.data
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await request(RELEASES_API, {
        method: 'GET',
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'FeelPost'
        },
        signal: controller.signal
      })
      if (response.statusCode === 404) {
        const empty: UpdateInfo = {
          currentVersion: this.currentVersion,
          latestVersion: this.currentVersion,
          hasUpdate: false,
          name: 'FeelPost',
          url: RELEASES_PAGE,
          publishedAt: null
        }
        this.cached = { at: Date.now(), data: empty }
        return empty
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await response.body.dump().catch(() => undefined)
        throw new AppException('NETWORK', `检查更新失败：GitHub 返回 ${response.statusCode}。`, undefined, true)
      }
      const payload = JSON.parse(await response.body.text()) as {
        tag_name?: string
        name?: string
        html_url?: string
        published_at?: string
      }
      const latestVersion = normalizeVersion(payload.tag_name || payload.name || this.currentVersion)
      const data: UpdateInfo = {
        currentVersion: this.currentVersion,
        latestVersion,
        hasUpdate: isNewerVersion(latestVersion, this.currentVersion),
        name: payload.name || `FeelPost v${latestVersion}`,
        url: payload.html_url || RELEASES_PAGE,
        publishedAt: payload.published_at || null
      }
      this.cached = { at: Date.now(), data }
      return data
    } catch (error) {
      if (error instanceof AppException) throw error
      if (controller.signal.aborted) {
        throw new AppException('TIMEOUT', '检查更新超时，请稍后重试。', undefined, true)
      }
      throw new AppException('NETWORK', '检查更新失败，请检查网络连接。', undefined, true)
    } finally {
      clearTimeout(timer)
    }
  }
}
