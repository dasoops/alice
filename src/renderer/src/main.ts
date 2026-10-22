import log from 'electron-log/renderer'

const api = window.api
const br = '<br />'

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
  document.getElementById('loading')!.classList.remove('hidden')
  document.getElementById('loading-text')!.textContent = `正在加载 ${await api.reader.fileName()}`
}

function hideLoading(): void {
  document.getElementById('content')!.classList.remove('hidden')
  document.getElementById('loading')!.classList.add('hidden')
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
    const content = await api.reader.read(offset)
    contentDiv.innerHTML = content
      .split('\n')
      .map((it) => it.trim())
      .filter((it) => it.length > 0)
      .join(br)
  } finally {
    hideLoading()
  }
}

init()
