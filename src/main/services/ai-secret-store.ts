import { promises as fs } from 'node:fs'
import { ensureDir } from '../storage/json-store'
import { safeStorage } from 'electron'
import { aiSecretFile } from '../storage/paths'

export type KeyStorageMode = 'persistent' | 'session' | 'none'

export interface AISecretProvider {
  get(): Promise<string>
  mode(): Promise<KeyStorageMode>
  set(value: string): Promise<KeyStorageMode>
  clear(): Promise<KeyStorageMode>
}

/**
 * Stores the AI API key outside preferences.json.
 * When the OS keychain is unavailable, the key is kept in memory only.
 */
export class AISecretStore implements AISecretProvider {
  private sessionKey = ''
  private storageMode: KeyStorageMode = 'none'
  private loaded = false

  constructor(private readonly dataDir: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    if (!safeStorage.isEncryptionAvailable()) return
    try {
      const encrypted = await fs.readFile(aiSecretFile(this.dataDir))
      const value = safeStorage.decryptString(encrypted).trim()
      if (value) {
        this.sessionKey = value
        this.storageMode = 'persistent'
      }
    } catch {
      // Missing or undecryptable secret is treated as not configured.
    }
  }

  async get(): Promise<string> {
    await this.load()
    return this.sessionKey
  }

  async mode(): Promise<KeyStorageMode> {
    await this.load()
    return this.storageMode
  }

  async set(value: string): Promise<KeyStorageMode> {
    const key = value.trim()
    if (!key) return this.clear()
    this.sessionKey = key
    if (!safeStorage.isEncryptionAvailable()) {
      this.storageMode = 'session'
      return this.storageMode
    }
    const encrypted = safeStorage.encryptString(key)
    await ensureDir(this.dataDir)
    await fs.writeFile(aiSecretFile(this.dataDir), encrypted, { mode: 0o600 })
    this.storageMode = 'persistent'
    return this.storageMode
  }

  async clear(): Promise<KeyStorageMode> {
    this.sessionKey = ''
    this.storageMode = 'none'
    try {
      await fs.unlink(aiSecretFile(this.dataDir))
    } catch {
      // File may not exist.
    }
    return this.storageMode
  }
}
