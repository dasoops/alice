import React, { useEffect, useMemo, useRef, useState } from 'react'
import shared from '../styles/shared.module.css'
import styles from './ChapterPanel.module.css'
import type {
  PopupChapter,
  PopupChapterGroup,
  PopupChapterOptions
} from '../../../../main/popup/types'

type Row =
  | { kind: 'volume'; key: string; group: PopupChapterGroup; head: number }
  | { kind: 'chapter'; key: string; chapter: PopupChapter }

const EMPTY_EXPANDED: ReadonlySet<number> = new Set()

const chapterKey = (index: number): string => `c:${index}`
const volumeKey = (head: number): string => `v:${head}`

const chapterIndexOf = (key: string): number | null => {
  if (!key.startsWith('c:')) return null
  const index = Number(key.slice(2))
  return Number.isNaN(index) ? null : index
}

// 包住某章节的可折叠卷已展开则定位章节行, 否则定位卷头行(仅当前章所在卷默认展开)
function locateChapter(
  index: number,
  groups: PopupChapterGroup[],
  expanded: ReadonlySet<number>
): string {
  for (const group of groups) {
    if (group.title === undefined || !group.collapsible || group.head === undefined) continue
    if (!group.chapters.some((chapter) => chapter.index === index)) continue
    return expanded.has(group.head) ? chapterKey(index) : volumeKey(group.head)
  }
  return chapterKey(index)
}

// 打开时只展开当前章所在卷, 保证默认定位到当前章节; 其余卷仍默认折叠
function expandCurrentVolume(current: number, groups: PopupChapterGroup[]): ReadonlySet<number> {
  const group = groups.find(
    (item) =>
      item.collapsible &&
      item.head !== undefined &&
      item.chapters.some((chapter) => chapter.index === current)
  )
  return group && group.head !== undefined ? new Set([group.head]) : EMPTY_EXPANDED
}

export function ChapterPanel({
  options,
  groups
}: {
  options: PopupChapterOptions
  groups: PopupChapterGroup[]
}): React.JSX.Element {
  const { chapters, current, bookName } = options
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() =>
    expandCurrentVolume(current, groups)
  )
  const [active, setActive] = useState(() =>
    locateChapter(current, groups, expandCurrentVolume(current, groups))
  )
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const keyword = query.trim()
  const byNumber = /^\d+$/.test(keyword)
  const visible = useMemo(
    () =>
      chapters.filter((chapter) =>
        keyword === ''
          ? true
          : byNumber
            ? String(chapter.index).includes(keyword) || chapter.index === Number(keyword)
            : chapter.title.includes(keyword)
      ),
    [chapters, keyword, byNumber]
  )

  // 无关键字时按组渲染(可折叠卷只出卷头行, 展开后才出章节行); 搜索时忽略分组平铺
  const rows = useMemo<Row[]>(() => {
    if (keyword) {
      return visible.map((chapter) => ({
        kind: 'chapter' as const,
        key: chapterKey(chapter.index),
        chapter
      }))
    }
    const result: Row[] = []
    for (const group of groups) {
      if (group.title === undefined || !group.collapsible || group.head === undefined) {
        for (const chapter of group.chapters) {
          result.push({ kind: 'chapter', key: chapterKey(chapter.index), chapter })
        }
        continue
      }
      result.push({ kind: 'volume', key: volumeKey(group.head), group, head: group.head })
      if (expanded.has(group.head)) {
        for (const chapter of group.chapters) {
          result.push({ kind: 'chapter', key: chapterKey(chapter.index), chapter })
        }
      }
    }
    return result
  }, [keyword, visible, groups, expanded])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 打开时定位当前章所在卷头(折叠)或当前章节行; 过滤时回到列表顶部
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    if (keyword) {
      list.scrollTop = 0
      return
    }
    list.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'center' })
  }, [keyword])

  const toggleGroup = (head: number, group: PopupChapterGroup): void => {
    const next = new Set(expanded)
    if (next.has(head)) {
      next.delete(head)
      // 折叠时若高亮在卷内章节行上, 收回到卷头行
      if (group.chapters.some((chapter) => chapterKey(chapter.index) === active)) {
        setActive(volumeKey(head))
      }
    } else {
      next.add(head)
      setActive(volumeKey(head))
    }
    setExpanded(next)
  }

  // 清空关键字后, 把高亮从搜索态的章节行映射回卷头行/章节行
  const clearQuery = (): void => {
    setQuery('')
    setActive(locateChapter(chapterIndexOf(active) ?? current, groups, expanded))
  }

  const move = (delta: number): void => {
    if (rows.length === 0) return
    const at = rows.findIndex((row) => row.key === active)
    const next = Math.max(0, Math.min(rows.length - 1, at === -1 ? 0 : at + delta))
    const key = rows[next].key
    setActive(key)
    listRef.current
      ?.querySelector<HTMLElement>(`[data-key="${key}"]`)
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
      const row = rows.find((item) => item.key === active) ?? rows[0]
      if (!row) return
      setActive(row.key)
      if (row.kind === 'volume') toggleGroup(row.head, row.group)
      else window.popup.resolve(row.chapter.index)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (keyword) clearQuery()
      else window.popup.cancel()
    }
  }

  return (
    <div className={styles.panel} role="dialog" aria-modal="true" aria-label="章节选择">
      <header className={styles.bar}>
        <span className={styles.title}>章节选择</span>
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
          onChange={(event) => {
            const value = event.target.value
            if (value.trim() === '') clearQuery()
            else setQuery(value)
          }}
          onKeyDown={onKeyDown}
        />
        <span className={styles.kbd}>Esc</span>
      </div>

      <div className={styles.list} ref={listRef}>
        {rows.length === 0 && <div className={styles.empty}>没有匹配的章节</div>}
        {rows.map((row) => {
          if (row.kind === 'volume') {
            const open = expanded.has(row.head)
            const inCurrent = row.group.chapters.some((chapter) => chapter.index === current)
            return (
              <div
                key={row.key}
                data-key={row.key}
                data-active={row.key === active}
                role="button"
                aria-expanded={open}
                className={`${styles.volume}${row.key === active ? ` ${styles.active}` : ''}`}
                onClick={() => {
                  setActive(row.key)
                  toggleGroup(row.head, row.group)
                }}
              >
                <span
                  className={`${styles.arrow}${open ? ` ${styles.arrowOpen}` : ''}`}
                  aria-hidden="true"
                >
                  ▸
                </span>
                <span className={styles.volTitle}>{row.group.title}</span>
                {inCurrent && <span className={styles.tag}>当前</span>}
                <span className={styles.volCount}>{row.group.chapters.length - 1} 章</span>
              </div>
            )
          }
          const chapter = row.chapter
          return (
            <div
              key={row.key}
              data-key={row.key}
              data-index={chapter.index}
              data-active={row.key === active}
              className={`${styles.row}${chapter.index === current ? ` ${styles.current}` : ''}${
                row.key === active ? ` ${styles.active}` : ''
              }`}
              onClick={() => window.popup.resolve(chapter.index)}
            >
              <span className={styles.idx}>{chapter.index}</span>
              <span className={styles.ttl}>{chapter.title}</span>
              {chapter.index === current && <span className={styles.tag}>当前</span>}
            </div>
          )
        })}
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
