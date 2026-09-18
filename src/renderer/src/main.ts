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
    const modal = document.getElementById('modal')!
    if (modal.style.display !== 'flex') {
      modal.style.display = 'flex'
    } else {
      modal.style.display = 'none'
    }
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

  const contentDiv = document.getElementById('content')!
  contentDiv.addEventListener('wheel', async (event) => {
    // 上滑
    if (event.deltaY < 0) await changePage(-1)
    // 下滑
    else if (event.deltaY > 0) await changePage(1)
  })
  contentDiv.addEventListener('contextmenu', api.toggleDisplay)

  await changePage(0)
}

async function showLoading(): Promise<void> {
  document.getElementById('loading')!.classList.remove('hidden')
  document.getElementById('loading-text')!.textContent = `正在加载 ${await api.reader.fileName()}`
}

function hideLoading(): void {
  document.getElementById('loading')!.classList.add('hidden')
}

async function changePage(offset: number): Promise<void> {
  const contentDiv = document.getElementById('content')!
  // 首次读取需等待主进程解压 epub, 期间展示 loading 避免空白
  if (contentDiv.innerHTML.length === 0) await showLoading()
  try {
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
