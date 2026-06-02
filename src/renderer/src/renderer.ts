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
  ipcRenderer.on('refresh-content', async () => {
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

async function changePage(offset: number): Promise<void> {
  const contentDiv = document.getElementById('content')
  let content = await api.reader.read(offset)
  content = content.replace(/\n/g, br) || 'No content'
  if (content.startsWith(br)) content = content.substring(br.length)
  contentDiv!.innerHTML = content
}

init()
