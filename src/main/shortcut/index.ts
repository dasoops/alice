import { Conf } from 'electron-conf'
import log from 'electron-log/main'
import { globalShortcut } from 'electron'

type ShortcutKeys = 'toggleDisplay' | 'toggleLock' | 'prevPage' | 'nextPage' | 'exit'
export type Config = Record<ShortcutKeys, string[]>
export const Config: { Default: Config } = {
  Default: {
    toggleDisplay: ['Ctrl+Q'],
    toggleLock: ['Ctrl+P'],
    prevPage: ['Ctrl+1'],
    nextPage: ['Ctrl+E'],
    exit: ['Ctrl+3']
  }
}
export type ShortcutManagerHandler = Record<ShortcutKeys, () => void>

export class ShortcutManager {
  private readonly conf: Conf<Config>
  private readonly handler: ShortcutManagerHandler
  public readonly initlization: Promise<void>

  constructor({ conf, handler }: { conf: Conf<Config>; handler: ShortcutManagerHandler }) {
    this.conf = conf
    this.handler = handler

    this.initlization = this.init()
  }

  private async init(): Promise<void> {
    log.info(`ShortcutManager ==> init`)
    const store = this.conf.store
    // key 字段名
    // accelerators 快捷键集合
    for (const key in store) {
      const onDidChange: (key: string, newValue: string[], oldValue: string[]) => void = (
        key,
        newValue,
        oldValue
      ) => {
        oldValue.forEach((accelerator) => this.unregister(accelerator))
        newValue.forEach((accelerator) => this.register(accelerator, this.handler[key]))
      }

      onDidChange(key, store[key], [])
      this.conf.onDidChange(key, (newValue, oldValue) => {
        // When a key is first set oldValue will be undefined, and when a key is deleted newValue will be undefined.
        if (undefined === newValue || undefined === oldValue) throw Error('unexpected')
        log.info(
          `shortcut configuration change: key: ${key}, [${oldValue.join(', ')}] => [${newValue.join(', ')}]`
        )
        onDidChange(key, newValue, oldValue)
      })
    }
    log.info(`ShortcutManager <== init ok`)
  }

  register(accelerator: string, callback: () => void): void {
    const ret = globalShortcut.register(accelerator, callback)
    if (ret) {
      log.info(`Registered shortcut: ${accelerator}`, callback)
    } else {
      log.error(`Failed to register shortcut: ${accelerator}`, callback)
    }
  }

  unregister(accelerator: string): void {
    globalShortcut.unregister(accelerator)
    log.info(`UnRegistered shortcut: ${accelerator}`)
  }
}
