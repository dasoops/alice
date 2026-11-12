import log from 'electron-log/renderer'
import type { ReaderStatus, StatusConfig } from '../../main/reader'
import { renderStatusTemplate } from './lib/statusTemplate'

const api = window.api
const br = '<br />'

let statusConfig: StatusConfig | undefined
let statusProgress: ReaderStatus['progress']

function renderStatus(): void {
  const status = document.getElementById('status')!
  const reader = document.getElementById('reader')!
  const config = statusConfig
  const progress = statusProgress
  if (!config?.enabled || !progress) {
    reader.classList.remove('status-top', 'status-bottom')
    status.classList.add('hidden')
    return
  }

  const template = config.formats[config.formatIndex] ?? ''
  const text = template
    ? renderStatusTemplate(template, {
        chapter: progress.chapterTitle,
        page: String(progress.page ?? ''),
        total: String(progress.pageTotal ?? ''),
        percent: String(Math.floor(progress.percent * 100))
      })
    : ''

  // 空格式不显示空白角标与占位间距
  if (!text) {
    reader.classList.remove('status-top', 'status-bottom')
    status.classList.add('hidden')
    return
  }

  const top = config.corner === 'top-left' || config.corner === 'top-right'
  reader.classList.toggle('status-top', top)
  reader.classList.toggle('status-bottom', !top)
  status.dataset.corner = config.corner
  status.classList.toggle('is-plain', config.style === 'plain')
  status.textContent = text
  status.classList.remove('hidden')
}

function applyStatus(status: ReaderStatus): void {
  statusConfig = status.config
  statusProgress = status.progress
  renderStatus()
}

async function refreshStatus(): Promise<void> {
  // 关闭时主进程不计算分页, 首次调用仍需获取配置
  if (statusConfig && !statusConfig.enabled) return
  try {
    applyStatus(await api.reader.status())
  } catch (err) {
    // 角标失败不影响正文翻页
    log.warn('更新阅读角标失败', err)
  }
}

// 设置面板保存后即时更新角标位置与显隐, 无需等待下一次翻页
function applyStatusConfig(config: StatusConfig): void {
  statusConfig = config
  if (!config.enabled) {
    statusProgress = undefined
    renderStatus()
    return
  }
  void refreshStatus()
}

function init(): void {
  window.addEventListener('DOMContentLoaded', async () => {
    await init0()
  })
}

async function init0(): Promise<void> {
  const ipcRenderer = window.electron.ipcRenderer
  ipcRenderer.on('next-page', () => {
    log.debug('ipcRenderer <== next-page')
    changePage(1)
  })
  ipcRenderer.on('prev-page', () => {
    log.debug('ipcRenderer <== prev-page')
    changePage(-1)
  })
  ipcRenderer.on('toggle-lock', async () => {
    log.debug('ipcRenderer <== toggle-lock')
    document.getElementById('reader')!.classList.toggle('is-unlocked')
  })
  ipcRenderer.on('loading', async () => {
    log.debug('ipcRenderer <== loading')
    await showLoading()
  })
  ipcRenderer.on('loading-hide', () => {
    log.debug('ipcRenderer <== loading-hide')
    hideLoading()
  })
  ipcRenderer.on('refresh-content', async () => {
    log.debug('ipcRenderer <== refresh-content')
    await changePage(0)
  })
  ipcRenderer.on('status-config', (_event, config: StatusConfig) => {
    log.debug('ipcRenderer <== status-config')
    applyStatusConfig(config)
  })
  ipcRenderer.on('paging-config', () => {
    log.debug('ipcRenderer <== paging-config')
    void changePage(0)
  })

  // 监听挂在 window: 文本外的空白区与 loading 上都可翻页
  window.addEventListener('wheel', async (event) => {
    // 上滑
    if (event.deltaY < 0) await changePage(-1)
    // 下滑
    else if (event.deltaY > 0) await changePage(1)
  })
  window.addEventListener('contextmenu', api.toggleDisplay)

  await changePage(0)
}

async function showLoading(): Promise<void> {
  document.getElementById('content')!.classList.add('hidden')
  document.getElementById('status')!.classList.add('hidden')
  document.getElementById('loading')!.classList.remove('hidden')
  document.getElementById('loading-text')!.textContent = `正在加载 ${await api.reader.fileName()}`
}

function hideLoading(): void {
  document.getElementById('content')!.classList.remove('hidden')
  document.getElementById('loading')!.classList.add('hidden')
  // 加载失败时保留旧书, 用缓存进度恢复角标
  renderStatus()
}

// read 会推进主进程侧阅读位置, 并发调用(滚轮高频 / 切书刷新)会让位置与显示错乱, 故串行化
let queue: Promise<void> = Promise.resolve()

function changePage(offset: number): Promise<void> {
  const next = queue.catch(() => undefined).then(() => renderPage(offset))
  queue = next
  return next
}

async function renderPage(offset: number): Promise<void> {
  const contentDiv = document.getElementById('content')!
  try {
    // 首次读取需等待主进程解压 epub, 期间展示 loading 避免空白
    if (contentDiv.innerHTML.length === 0) await showLoading()
    const result = await api.reader.read(offset)
    contentDiv.innerHTML = result.content
      .split('\n')
      .map((it) => it.trim())
      .filter((it) => it.length > 0)
      .join(br)
    applyStatus(result.status)
  } finally {
    hideLoading()
  }
}

init()
