import type { ReadingProgress, StatusConfig } from '../../../shared/reader'
import { readerStyleCss, type ReaderStyle } from '../../../shared/readerStyle'
import { renderStatusTemplate } from '../lib/statusTemplate'

export type ReaderElements = {
  reader: HTMLElement
  content: HTMLElement
  status: HTMLElement
  loading: HTMLElement
  loadingText: HTMLElement
}

export function readerElements(): ReaderElements {
  return {
    reader: document.getElementById('reader')!,
    content: document.getElementById('content')!,
    status: document.getElementById('status')!,
    loading: document.getElementById('loading')!,
    loadingText: document.getElementById('loading-text')!
  }
}

// 复用同一个 style 节点, 重复应用只替换内容, 避免堆积
export function applyReaderStyle(style: ReaderStyle): void {
  let styleEl = document.getElementById('reader-style') as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'reader-style'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = readerStyleCss(style)
}

// 页码由 session 按当前分页结果补齐, 这里只负责呈现
export function renderStatus(
  elements: ReaderElements,
  config: StatusConfig | undefined,
  progress: ReadingProgress | undefined
): void {
  const { reader, status } = elements
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

export function renderContent(elements: ReaderElements, html: string): void {
  elements.content.innerHTML = html
}

export function renderLoading(elements: ReaderElements, fileName: string): void {
  elements.content.classList.add('hidden')
  elements.status.classList.add('hidden')
  elements.loading.classList.remove('hidden')
  elements.loadingText.textContent = `正在加载 ${fileName}`
}

export function clearLoading(elements: ReaderElements): void {
  elements.content.classList.remove('hidden')
  elements.loading.classList.add('hidden')
}

export function toggleReaderLock(elements: ReaderElements): void {
  elements.reader.classList.toggle('is-unlocked')
}
