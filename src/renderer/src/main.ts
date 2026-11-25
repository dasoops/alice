import log from 'electron-log/renderer'
import { readerElements } from './reader/dom'
import { bindReaderEvents } from './reader/ipc'
import { ReaderSession } from './reader/session'

async function start(): Promise<void> {
  const elements = readerElements()
  const session = new ReaderSession({ elements, api: window.api.reader })
  bindReaderEvents(session, elements.reader)
  // 自定义 @font-face 在内容为空时不会被使用, fonts.ready 不会等待它;
  // 字体真正加载完成后按锚点重新分页, 避免首屏按 fallback 度量裁字
  document.fonts?.addEventListener('loadingdone', () => session.scheduleReflow(true))

  // 样式先落地再渲染正文, 避免首屏按默认样式闪现
  try {
    session.applyStyle(await window.api.reader.style())
  } catch (err) {
    log.warn('读取阅读样式失败', err)
  }
  // 正文渲染后仍等一次字体就绪, 覆盖首屏即有文本可测量的情况
  try {
    await document.fonts?.ready
  } catch (err) {
    log.warn('等待字体加载失败', err)
  }
  await session.refresh().catch((err) => log.warn('初始化阅读内容失败', err))
}

window.addEventListener('DOMContentLoaded', () => {
  start().catch((err) => log.warn('初始化阅读器失败', err))
})
