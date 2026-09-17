import React, { useEffect } from 'react'
import { layoutOf } from './lib/layout'
import { ChapterPanel } from './components/ChapterPanel'
import { MessageBand } from './components/MessageBand'
import { PromptBand } from './components/PromptBand'
import { SettingsPanel } from './components/SettingsPanel'
import type { PopupInit } from '../../../main/popup/types'

// 内容超过初始高度时请求主进程增高, growWindow 只增高不回缩, 不会抖动
function measureBand(): void {
  const band = document.querySelector<HTMLElement>('[data-band]')
  if (!band) return
  window.popup.resize(Math.ceil(band.scrollHeight))
}

export function App({ init }: { init: PopupInit }): React.JSX.Element {
  const layout = layoutOf(init.mode)

  useEffect(() => {
    requestAnimationFrame(() => {
      document.getElementById('popup')?.classList.add('is-ready')
      if (layout === 'band') measureBand()
    })
    document.fonts?.ready.then(() => {
      if (layout === 'band') measureBand()
    })
  }, [layout])

  if (init.mode === 'message') return <MessageBand options={init.options} />
  if (init.mode === 'prompt') return <PromptBand options={init.options} />
  if (init.mode === 'chapter') return <ChapterPanel options={init.options} />
  return <SettingsPanel data={init.data} />
}
