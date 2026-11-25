import log from 'electron-log/renderer'
import type { StatusConfig } from '../../../shared/reader'
import type { ReaderStyle } from '../../../shared/readerStyle'
import type { ReaderSession } from './session'

// 把窗口级输入接到 session; 订阅随页面生命周期存在, 无需解绑
export function bindReaderEvents(session: ReaderSession, reader: HTMLElement): void {
  const ipcRenderer = window.electron.ipcRenderer

  ipcRenderer.on('next-page', () => {
    log.debug('ipcRenderer <== next-page')
    session.changePage(1).catch((err) => log.warn('翻页失败', err))
  })
  ipcRenderer.on('prev-page', () => {
    log.debug('ipcRenderer <== prev-page')
    session.changePage(-1).catch((err) => log.warn('翻页失败', err))
  })
  ipcRenderer.on('toggle-lock', () => {
    log.debug('ipcRenderer <== toggle-lock')
    session.toggleLock()
  })
  ipcRenderer.on('loading', () => {
    log.debug('ipcRenderer <== loading')
    session.showLoading().catch((err) => log.warn('显示加载状态失败', err))
  })
  ipcRenderer.on('loading-hide', () => {
    log.debug('ipcRenderer <== loading-hide')
    session.hideLoading()
  })
  ipcRenderer.on('refresh-content', () => {
    log.debug('ipcRenderer <== refresh-content')
    session.refresh().catch((err) => log.warn('加载章节失败', err))
  })
  ipcRenderer.on('status-config', (_event, config: StatusConfig) => {
    log.debug('ipcRenderer <== status-config')
    session.applyStatusConfig(config)
  })
  ipcRenderer.on('style-config', (_event, style: ReaderStyle) => {
    log.debug('ipcRenderer <== style-config')
    session.applyStyle(style)
  })

  // 监听挂在 window: 文本外的空白区与 loading 上都可翻页
  window.addEventListener('wheel', (event) => {
    if (event.deltaY < 0) session.changePage(-1).catch((err) => log.warn('翻页失败', err))
    else if (event.deltaY > 0) session.changePage(1).catch((err) => log.warn('翻页失败', err))
  })
  window.addEventListener('contextmenu', window.api.toggleDisplay)

  // 窗口尺寸变化时按新可用区域重排; 角标/样式变化由各自事件强制重排
  new ResizeObserver(() => session.scheduleReflow()).observe(reader)
}
