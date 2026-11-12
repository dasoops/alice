import React, { useEffect, useRef, useState } from 'react'
import shared from '../styles/shared.module.css'
import styles from './SettingsPanel.module.css'
import {
  errorList,
  firstErrorKey,
  shortcutKeys,
  statusCornerOptions,
  statusStyleOptions,
  syncOptions,
  validateSettings,
  type SettingsErrors
} from '../lib/validateSettings'
import type { SettingsData } from '../../../../main/popup/types'

type ChapterRegexItem = SettingsData['reader']['txt']['chapterRegex'][number]

export function SettingsPanel({ data }: { data: SettingsData }): React.JSX.Element {
  const [draft, setDraft0] = useState<SettingsData>(data)
  const originalRef = useRef(data)
  const [configDir, setConfigDir] = useState('')
  const [confirming, setConfirming] = useState(false)

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

  // 有未保存修改时先询问, 避免关闭时静默写入; 询问框打开时 Esc 仅取消询问
  const requestClose = (): void => {
    if (confirming) {
      setConfirming(false)
      return
    }
    if (!dirty) {
      window.popup.cancel()
      return
    }
    setConfirming(true)
  }

  const requestCloseRef = useRef(requestClose)
  requestCloseRef.current = requestClose
  const confirmingRef = useRef(confirming)
  confirmingRef.current = confirming

  // 放弃修改直接关闭, 面板销毁后重新打开会回到已保存配置
  const discardAndClose = (): void => {
    setConfirming(false)
    window.popup.cancel()
  }

  // 校验不通过时关闭询问框, 避免遮挡 apply 聚焦的错误字段
  const saveAndClose = async (): Promise<void> => {
    if (await apply()) {
      window.popup.cancel()
      return
    }
    setConfirming(false)
  }

  const saveAndCloseRef = useRef(saveAndClose)
  saveAndCloseRef.current = saveAndClose

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestCloseRef.current()
      } else if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        // 询问框打开时 Ctrl+S 等同于确认保存
        if (confirmingRef.current) void saveAndCloseRef.current()
        else void applyRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const currentRegex = (): ChapterRegexItem[] => draft.reader.txt.chapterRegex

  const updateRegex = (index: number, patch: Partial<ChapterRegexItem>): void => {
    setDraft('reader', 'txt', {
      chapterRegex: currentRegex().map((item, i) => (i === index ? { ...item, ...patch } : item))
    })
  }

  const selectFormat = (index: number): void => {
    setDraft('reader', 'status', { ...draft.reader.status, formatIndex: index })
  }

  const updateFormat = (index: number, template: string): void => {
    setDraft('reader', 'status', {
      ...draft.reader.status,
      formats: draft.reader.status.formats.map((item, i) => (i === index ? template : item))
    })
  }

  const addFormat = (): void => {
    setDraft('reader', 'status', {
      ...draft.reader.status,
      formats: [...draft.reader.status.formats, '']
    })
  }

  const removeFormat = (index: number): void => {
    const { formats, formatIndex } = draft.reader.status
    if (formats.length <= 1) return
    const next = formats.filter((_it, i) => i !== index)
    // 删除启用项时顺延到相邻项; 删除前置项时索引前移
    const nextIndex =
      index < formatIndex
        ? formatIndex - 1
        : index === formatIndex
          ? Math.min(formatIndex, next.length - 1)
          : formatIndex
    setDraft('reader', 'status', {
      ...draft.reader.status,
      formats: next,
      formatIndex: nextIndex
    })
  }

  return (
    <div className={styles.panel} role="dialog" aria-modal="true" aria-label="设置">
      <header className={styles['panel-bar']}>
        <span className={styles['panel-title']}>设置</span>
        <button className={shared['icon-btn']} aria-label="关闭" onClick={requestClose}>
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
          <span className={styles['row-key']}>单页字符上限</span>
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
              <div
                className={`${styles['regex-item']}${
                  regex.enabled ? '' : ` ${styles['is-disabled']}`
                }`}
                key={index}
              >
                <label className={styles.checkbox} title="启用该正则">
                  <input
                    type="checkbox"
                    aria-label={`启用正则 ${index + 1}`}
                    checked={regex.enabled}
                    onChange={(event) => updateRegex(index, { enabled: event.target.checked })}
                  />
                  <span className={styles['checkbox-mark']} aria-hidden="true" />
                </label>
                <input
                  className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}${
                    errors.regex[index] ? ` ${shared['is-invalid']}` : ''
                  }`}
                  type="text"
                  value={regex.pattern}
                  ref={registerField(`regex:${index}`)}
                  onChange={(event) => updateRegex(index, { pattern: event.target.value })}
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
              onClick={() =>
                setDraft('reader', 'txt', {
                  chapterRegex: [...currentRegex(), { pattern: '', enabled: true }]
                })
              }
            >
              + 添加
            </button>
          </div>
        </div>

        <div className={styles.sect}>阅读进度</div>

        <div className={styles.row}>
          <span className={styles['row-key']}>启用</span>
          <button
            className={`${styles.switch}${draft.reader.status.enabled ? ` ${styles['is-on']}` : ''}`}
            role="switch"
            aria-checked={draft.reader.status.enabled}
            onClick={() =>
              setDraft('reader', 'status', {
                ...draft.reader.status,
                enabled: !draft.reader.status.enabled
              })
            }
          />
        </div>

        <div className={styles.row}>
          <span className={styles['row-key']}>位置</span>
          <div className={styles['radio-group']}>
            {statusCornerOptions.map((option) => (
              <label className={styles.radio} key={option.value}>
                <input
                  type="radio"
                  name="statusCorner"
                  checked={draft.reader.status.corner === option.value}
                  onChange={() =>
                    setDraft('reader', 'status', { ...draft.reader.status, corner: option.value })
                  }
                />
                <span className={styles['radio-mark']} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <span className={styles['row-key']}>样式</span>
          <div className={styles['radio-group']}>
            {statusStyleOptions.map((option) => (
              <label className={styles.radio} key={option.value}>
                <input
                  type="radio"
                  name="statusStyle"
                  checked={draft.reader.status.style === option.value}
                  onChange={() =>
                    setDraft('reader', 'status', { ...draft.reader.status, style: option.value })
                  }
                />
                <span className={styles['radio-mark']} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={`${styles.row} ${styles['row-block']}`}>
          <span className={styles['row-key']}>格式</span>
          <div className={styles['format-list']}>
            {draft.reader.status.formats.map((format, index) => {
              const active = draft.reader.status.formatIndex === index
              return (
                <div className={styles['format-item']} key={index}>
                  <label className={styles.radio}>
                    <input
                      type="radio"
                      name="statusFormat"
                      aria-label={`启用格式 ${index + 1}`}
                      checked={active}
                      onChange={() => selectFormat(index)}
                    />
                    <span className={styles['radio-mark']} aria-hidden="true" />
                  </label>
                  <input
                    className={`${shared.input} ${shared['input-flex']} ${shared['is-mono']}${
                      active && errors.statusFormats ? ` ${shared['is-invalid']}` : ''
                    }`}
                    type="text"
                    value={format}
                    placeholder="例如 {chapter} · {page}/{total}"
                    ref={active ? registerField('statusFormats') : undefined}
                    onChange={(event) => updateFormat(index, event.target.value)}
                  />
                  <button
                    className={`${shared['link-btn']} ${shared['link-danger']} ${styles['delete-btn']}`}
                    disabled={draft.reader.status.formats.length <= 1}
                    onClick={() => removeFormat(index)}
                  >
                    删除
                  </button>
                </div>
              )
            })}
            <button className={shared['link-btn']} onClick={addFormat}>
              + 新建
            </button>
            <span className={styles.hint}>
              可用变量: {'{chapter}'} 章节名, {'{page}'}/{'{total}'} 本章页码, {'{percent}'}{' '}
              全书百分比
            </span>
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
        <button
          className={styles['status-path']}
          title={`打开 ${configDir}`}
          onClick={() => {
            void window.popup.openConfigDir()
          }}
        >
          {configDir}
        </button>
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
        <button
          className={`${shared.btn} ${shared['btn-ghost']}`}
          title="Esc"
          onClick={requestClose}
        >
          关闭
        </button>
        <button
          className={`${shared.btn} ${shared['btn-primary']}`}
          title="Ctrl+S"
          // 无改动或存在校验错误时保存无意义/不可行
          disabled={!dirty || errorTexts.length > 0}
          onClick={() => {
            void apply()
          }}
        >
          保存
        </button>
      </footer>

      {confirming && (
        <div
          className={styles['confirm-mask']}
          role="alertdialog"
          aria-modal="true"
          aria-label="未保存的修改"
        >
          <div className={styles.confirm}>
            <p className={styles['confirm-text']}>有未保存的修改, 是否保存?</p>
            <div className={styles['confirm-actions']}>
              <button
                className={`${shared.btn} ${shared['btn-ghost']}`}
                autoFocus={errorTexts.length > 0}
                onClick={() => setConfirming(false)}
              >
                取消
              </button>
              <button className={`${shared.btn} ${shared['btn-ghost']}`} onClick={discardAndClose}>
                不保存
              </button>
              <button
                className={`${shared.btn} ${shared['btn-primary']}`}
                disabled={errorTexts.length > 0}
                autoFocus={errorTexts.length === 0}
                onClick={() => {
                  void saveAndClose()
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
