import React, { useEffect, useRef, useState } from 'react'
import shared from '../styles/shared.module.css'
import styles from './ChapterPanel.module.css'
import type { PopupChapterOptions } from '../../../../main/popup/types'

export function ChapterPanel({ options }: { options: PopupChapterOptions }): React.JSX.Element {
  const { chapters, current, bookName } = options
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(current)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const keyword = query.trim()
  const byNumber = /^\d+$/.test(keyword)
  const visible = chapters.filter((chapter) =>
    keyword === ''
      ? true
      : byNumber
        ? String(chapter.index).includes(keyword) || chapter.index === Number(keyword)
        : chapter.title.includes(keyword)
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 打开时定位当前章; 过滤时回到列表顶部
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    if (keyword) {
      list.scrollTop = 0
      return
    }
    list.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'center' })
  }, [keyword])

  const move = (delta: number): void => {
    if (visible.length === 0) return
    const at = visible.findIndex((chapter) => chapter.index === active)
    const next = Math.max(0, Math.min(visible.length - 1, at === -1 ? 0 : at + delta))
    const index = visible[next].index
    setActive(index)
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const target = visible.some((chapter) => chapter.index === active)
        ? active
        : visible[0]?.index
      if (target !== undefined) window.popup.resolve(target)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (keyword) setQuery('')
      else window.popup.cancel()
    }
  }

  return (
    <div className={styles.panel} role="dialog" aria-modal="true" aria-label="跳转章节">
      <header className={styles.bar}>
        <span className={styles.title}>跳转章节</span>
        {bookName && <span className={styles.book}>{bookName}</span>}
        <span className={styles.count}>
          {keyword ? `${visible.length} 项` : `共 ${chapters.length} 章`}
        </span>
        <button className={styles.close} aria-label="关闭" onClick={() => window.popup.cancel()}>
          ✕
        </button>
      </header>

      <div className={styles.search}>
        <span className={styles.icon} aria-hidden="true">
          ⌕
        </span>
        <input
          ref={inputRef}
          className={styles.field}
          value={query}
          placeholder="搜索标题, 或输入章节序号"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className={styles.kbd}>Esc</span>
      </div>

      <div className={styles.list} ref={listRef}>
        {visible.length === 0 && <div className={styles.empty}>没有匹配的章节</div>}
        {visible.map((chapter) => (
          <div
            key={chapter.index}
            data-index={chapter.index}
            data-active={chapter.index === active}
            className={`${styles.row}${chapter.index === current ? ` ${styles.current}` : ''}${
              chapter.index === active ? ` ${styles.active}` : ''
            }`}
            onClick={() => window.popup.resolve(chapter.index)}
          >
            <span className={styles.idx}>{chapter.index}</span>
            <span className={styles.ttl}>{chapter.title}</span>
            {chapter.index === current && <span className={styles.tag}>当前</span>}
          </div>
        ))}
      </div>

      <footer className={styles.foot}>
        <span className={styles.pos}>当前 序号 {current}</span>
        <span className={shared.spacer} />
        <span className={styles.hint}>↑↓ 选择</span>
        <span className={styles.hint}>Enter 跳转</span>
        <span className={styles.hint}>Esc 关闭</span>
      </footer>
    </div>
  )
}
