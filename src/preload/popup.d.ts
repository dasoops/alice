import type { PopupInit, SettingsData } from '../main/popup/types'

export interface PopupApi {
  ready: (callback: (init: PopupInit) => void) => void
  resolve: (payload: unknown) => void
  cancel: () => void
  resize: (height: number) => void
  configDir: () => Promise<string>
  settingsRead: () => Promise<SettingsData>
  settingsWrite: (patch: SettingsData) => Promise<SettingsData>
  pickFile: (options?: { title?: string }) => Promise<string | null>
  validateFile: (filePath: string) => Promise<boolean>
}

declare global {
  interface Window {
    popup: PopupApi
  }
}

export {}
