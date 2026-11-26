import type { FeelpostApi } from '@shared/contract'

declare global {
  interface Window {
    feelpost: FeelpostApi
  }
}

export {}
