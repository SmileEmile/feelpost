import { parentPort, workerData } from 'node:worker_threads'
import { scanProject } from './java-scanner'
import type { ScanOptions, ScannerResult } from './types'

interface ScanWorkerInput {
  sourceDir: string
  scopeDirectory?: string
  excludePatterns: string[]
  grammarPath: string
}

const data = workerData as ScanWorkerInput
let cancelled = false

parentPort?.on('message', (message: { type?: string }) => {
  if (message?.type === 'cancel') cancelled = true
})

async function main(): Promise<void> {
  if (!parentPort) throw new Error('scan worker has no parent port')
  try {
    const options: ScanOptions = {
      sourceDir: data.sourceDir,
      scopeDirectory: data.scopeDirectory,
      excludePatterns: data.excludePatterns,
      grammarPath: data.grammarPath,
      isCancelled: () => cancelled,
      onProgress: (message, processed, total) => {
        parentPort?.postMessage({ type: 'progress', message, processed, total })
      }
    }
    const result: ScannerResult = await scanProject(options)
    if (cancelled) parentPort.postMessage({ type: 'cancelled' })
    else parentPort.postMessage({ type: 'result', result })
  } catch (error) {
    parentPort.postMessage({ type: 'error', message: (error as Error).message || '扫描失败。' })
  }
}

void main()
