import React, { useEffect, useRef, useState } from 'react'
import shared from '../styles/shared.module.css'
import styles from './SettingsPanel.module.css'
import {
  errorList,
  firstErrorKey,
  shortcutKeys,
  syncOptions,
  validateSettings,
  type SettingsErrors
} from '../lib/validateSettings'
import type { SettingsData } from '../../../../main/popup/types'

export function SettingsPanel({ data }: { data: SettingsData }): React.JSX.Element {
  const [draft, setDraft0] = useState<SettingsData>(data)
  const originalRef = useRef(data)
  const [configDir, setConfigDir] = useState('')

  useEffect(() => {
    void window.popup.configDir().then(setConfigDir)
  }, [])

  const setDraft = <S extends keyof SettingsData, K extends keyof SettingsData[S]>(
    section: S,
    key: K,
    value: SettingsData[S][K]
  ): void => {
    setDraft0((d) => ({ ...d, [section]: { ...d[section], [key]: value } }))
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(originalRef.current)

  // errors 为唯一错误事实源, draft 变化后由 effect 驱动异步刷新
  const [errors, setErrors] = useState<SettingsErrors>({ regex: [] })
  const validationRef = useRef<Promise<SettingsErrors>>(Promise.resolve(errors))

  useEffect(() => {
    const pending = validateSettings(draft)
    validationRef.current = pending
    let cancelled = false
    void pending.then((next) => {
      if (!cancelled) setErrors(next)
    })
    return () => {
      cancelled = true
    }
  }, [draft])

  const errorTexts = errorList(errors)
  // 字段 key 与 firstErrorKey 一致, 保存被拦截时聚焦首个错误输入框
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const registerField =
    (key: string) =>
    (el: HTMLInputElement | null): void => {
      fieldRefs.current[key] = el
    }

  // 校验不通过时返回 false, 阻止关闭/继续, 聚焦首个错误字段
  const apply = async (): Promise<boolean> => {
    // 等待最近一次校验落地, 避免异步校验未完成时放行
    const latest = await validationRef.current
    const texts = errorList(latest)
    if (texts.length > 0) {
      fieldRefs.current[firstErrorKey(latest)]?.focus()
      return false
    }
    const next = await window.popup.settingsWrite(draft)
    setDraft0(next)
    originalRef.current = next
    return true
  }

  const applyRef = useRef(apply)
  applyRef.current = apply

  // 有未保存修改时先保存, 保存被校验拦截则保持面板打开
  const closePopup = async (): Promise<void> => {
    if (dirty && !(await apply())) return
    window.popup.cancel()
  }

  const closePopupRef = useRef(closePopup)
  closePopupRef.current = closePopup

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void closePopupRef.current()
      } else if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        void applyRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const currentRegex = (): string[] => draft.reader.txt.chapterRegex

  return (
    <div className={styles.panel} role="dialog" aria-modal="true" aria-label="设置">
      <header className={styles['panel-bar']}>
        <span className={styles['panel-title']}>设置</span>
        <button
          className={shared['icon-btn']}
          aria-label="关闭"
          onClick={() => {
            void closePopup()
          }}
        >
          ✕
        </button>
      </header>

      <div className={styles['panel-body']}>
        <div className={styles.sect}>阅读</div>

        <label className={styles.row}>
          <span className={styles['row-key']}>阅读文件</span>
          <input
            className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}${
              errors.file ? ` ${shared['is-invalid']}` : ''
            }`}
            type="text"
            value={draft.reader.file}
            ref={registerField('file')}
            onChange={(event) => setDraft('reader', 'file', event.target.value)}
          />
          <button
            className={shared['link-btn']}
            onClick={async () => {
              const path = await window.popup.pickFile({ title: '选择阅读文件' })
              if (!path) return
              setDraft('reader', 'file', path)
            }}
          >
            选择
          </button>
        </label>

        <label className={styles.row}>
          <span className={styles['row-key']}>每行字符数</span>
          <input
            className={`${shared.input} ${styles['input-number']}${
              errors.chunkSize ? ` ${shared['is-invalid']}` : ''
            }`}
            type="number"
            min="1"
            value={draft.reader.chunkSize}
            ref={registerField('chunkSize')}
            onChange={(event) => setDraft('reader', 'chunkSize', Number(event.target.value))}
          />
        </label>

        <label className={styles.row}>
          <span className={styles['row-key']}>每次展示行数</span>
          <input
            className={`${shared.input} ${styles['input-number']}${
              errors.maxLine ? ` ${shared['is-invalid']}` : ''
            }`}
            type="number"
            min="1"
            value={draft.reader.maxLine}
            ref={registerField('maxLine')}
            onChange={(event) => setDraft('reader', 'maxLine', Number(event.target.value))}
          />
        </label>

        <div className={styles.row}>
          <span className={styles['row-key']}>同步粒度</span>
          <div className={styles['radio-group']}>
            {syncOptions.map((option) => (
              <label className={styles.radio} key={option.value}>
                <input
                  type="radio"
                  name="syncMode"
                  checked={draft.reader.sync.mode === option.value}
                  onChange={() => setDraft('reader', 'sync', { mode: option.value })}
                />
                <span className={styles['radio-mark']} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={`${styles.row} ${styles['row-block']}`}>
          <span className={styles['row-key']}>章节正则</span>
          <div className={styles['regex-list']}>
            {currentRegex().map((regex, index) => (
              <div className={styles['regex-item']} key={index}>
                <input
                  className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}${
                    errors.regex[index] ? ` ${shared['is-invalid']}` : ''
                  }`}
                  type="text"
                  value={regex}
                  ref={registerField(`regex:${index}`)}
                  onChange={(event) => {
                    const nextList = [...currentRegex()]
                    nextList[index] = event.target.value
                    setDraft('reader', 'txt', { chapterRegex: nextList })
                  }}
                />
                <button
                  className={`${shared['link-btn']} ${shared['link-danger']}`}
                  onClick={() => {
                    const nextList = currentRegex().filter((_it, i) => i !== index)
                    setDraft('reader', 'txt', { chapterRegex: nextList })
                  }}
                >
                  删除
                </button>
              </div>
            ))}
            <button
              className={shared['link-btn']}
              onClick={() => setDraft('reader', 'txt', { chapterRegex: [...currentRegex(), ''] })}
            >
              + 添加
            </button>
          </div>
        </div>

        <div className={styles.sect}>WebDav 同步</div>

        <div className={styles.row}>
          <span className={styles['row-key']}>启用</span>
          <button
            className={`${styles.switch}${draft.webdav.enabled ? ` ${styles['is-on']}` : ''}`}
            role="switch"
            aria-checked={draft.webdav.enabled}
            onClick={() => setDraft('webdav', 'enabled', !draft.webdav.enabled)}
          />
        </div>

        <label className={styles.row}>
          <span className={styles['row-key']}>地址</span>
          <input
            className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}${
              errors.url ? ` ${shared['is-invalid']}` : ''
            }`}
            type="text"
            value={draft.webdav.url}
            ref={registerField('url')}
            onChange={(event) => setDraft('webdav', 'url', event.target.value)}
          />
        </label>

        <label className={styles.row}>
          <span className={styles['row-key']}>用户名</span>
          <input
            className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}`}
            type="text"
            value={draft.webdav.username}
            onChange={(event) => setDraft('webdav', 'username', event.target.value)}
          />
        </label>

        <label className={styles.row}>
          <span className={styles['row-key']}>密码</span>
          <input
            className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}`}
            type="password"
            value={draft.webdav.password}
            onChange={(event) => setDraft('webdav', 'password', event.target.value)}
          />
        </label>

        <label className={styles.row}>
          <span className={styles['row-key']}>目录</span>
          <input
            className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}${
              errors.directory ? ` ${shared['is-invalid']}` : ''
            }`}
            type="text"
            value={draft.webdav.directory}
            ref={registerField('directory')}
            onChange={(event) => setDraft('webdav', 'directory', event.target.value)}
          />
        </label>

        <div className={styles.sect}>快捷键</div>

        <div className={styles['shortcut-grid']}>
          {shortcutKeys.map(({ key, label }) => (
            <div className={styles['shortcut-row']} key={key}>
              <span className={styles['row-key']}>{label}</span>
              <input
                className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}`}
                type="text"
                value={draft.shortcut[key].join(', ')}
                onChange={(event) => {
                  const accelerators = event.target.value
                    .split(',')
                    .map((it) => it.trim())
                    .filter((it) => it.length > 0)
                  setDraft('shortcut', key, accelerators)
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.status}>
        <span className={styles['status-path']}>{configDir}</span>
        <span
          className={`${styles['status-save']}${dirty ? ` ${styles['is-dirty']}` : ''}${
            errorTexts.length ? ` ${styles['has-error']}` : ''
          }`}
        >
          {errorTexts.length === 0
            ? dirty
              ? '未保存'
              : '已保存'
            : errorTexts.length === 1
              ? errorTexts[0]
              : `${errorTexts[0]} 等 ${errorTexts.length} 处`}
        </span>
        <span className={shared.spacer} />
        <span className={styles['status-hint']}>Esc 关闭</span>
        <span className={styles['status-hint']}>Ctrl+S 保存</span>
      </footer>
    </div>
  )
}
