import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type {
  PopupInit,
  PopupMessageOptions,
  PopupPromptOptions,
  ReaderSettings,
  SettingsData,
  ShortcutSettings
} from '../../main/popup/types'

const root = document.getElementById('popup') as HTMLElement
const reactRoot = createRoot(root)

// 内容超过初始高度时请求主进程增高, growWindow 只增高不回缩, 不会抖动
function measureBand(): void {
  const band = root.querySelector('.band') as HTMLElement | null
  if (!band) return
  window.popup.resize(Math.ceil(band.scrollHeight))
}

function Popup({ init }: { init: PopupInit }): React.JSX.Element {
  const mode = init.mode === 'settings' ? 'panel' : 'band'

  useEffect(() => {
    requestAnimationFrame(() => {
      root.classList.add('is-ready')
      if (mode === 'band') measureBand()
    })
    document.fonts?.ready.then(() => {
      if (mode === 'band') measureBand()
    })
  }, [mode])

  if (init.mode === 'message') return <MessageBand options={init.options} />
  if (init.mode === 'prompt') return <PromptBand options={init.options} />
  return <SettingsPanel data={init.data} />
}

window.popup.ready((init) => {
  root.className = init.mode === 'settings' ? 'mode-panel' : 'mode-band'
  reactRoot.render(<Popup init={init} />)
})

// ===== message =====

function MessageBand({ options }: { options: PopupMessageOptions }): React.JSX.Element {
  const type = options.type ?? 'info'
  const buttons = options.buttons?.length ? options.buttons : ['确定']
  const defaultId = options.defaultId ?? 0
  const cancelId = options.cancelId ?? buttons.length - 1
  const defaultBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    defaultBtnRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        window.popup.resolve(cancelId)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cancelId])

  return (
    <div
      className={`band band-${type}`}
      role={type === 'error' ? 'alertdialog' : 'dialog'}
      aria-modal="true"
    >
      <span className={`lead lead-${type}`} aria-hidden="true">
        {leadGlyph(type)}
      </span>
      <div className="band-text">
        {options.title && <span className="band-title">{options.title}</span>}
        <span className="band-message">{options.message}</span>
        {options.detail && <span className="band-detail">{options.detail}</span>}
      </div>
      <span className="spacer" />
      {buttons.map((label, index) => (
        <button
          key={index}
          ref={index === defaultId ? defaultBtnRef : undefined}
          className={index === defaultId ? 'btn btn-primary' : 'btn btn-ghost'}
          onClick={() => window.popup.resolve(index)}
        >
          {label}
        </button>
      ))}
      <div className={`ribbon ribbon-${type === 'error' ? 'danger' : 'accent'}`} />
    </div>
  )
}

function leadGlyph(type: PopupMessageOptions['type']): string {
  if (type === 'error') return '✗'
  if (type === 'warning') return '!'
  if (type === 'question') return '?'
  return 'ⓘ'
}

// ===== prompt =====

function PromptBand({ options }: { options: PopupPromptOptions }): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const ribbonRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(options.value ?? '')
  const [invalid, setInvalid] = useState(false)
  const inputAttrs = options.inputAttrs
  const min = inputAttrs?.min ?? 0
  const max = inputAttrs?.max

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const ribbon = ribbonRef.current
    if (!ribbon) return
    const number = Number(value)
    if (max === undefined || value.trim() === '' || Number.isNaN(number)) {
      ribbon.style.width = '0%'
      return
    }
    const ratio = Math.min(1, Math.max(0, (number - min) / (max - min)))
    ribbon.style.width = `${(ratio * 100).toFixed(2)}%`
  }, [value, min, max])

  const submit = (): void => {
    const text = value.trim()
    if (inputAttrs?.type !== 'text') {
      const number = Number(text)
      const outOfRange =
        text === '' ||
        Number.isNaN(number) ||
        (inputAttrs?.min !== undefined && number < inputAttrs.min) ||
        (inputAttrs?.max !== undefined && number > inputAttrs.max)
      if (outOfRange) {
        setInvalid(true)
        inputRef.current?.focus()
        return
      }
    }
    window.popup.resolve(text)
  }

  return (
    <div
      className="band band-prompt"
      role="dialog"
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          submit()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          window.popup.cancel()
        }
      }}
    >
      <span className="lead lead-prompt" aria-hidden="true">
        ❯
      </span>
      {(options.title || options.label) && (
        <div className="band-text">
          {options.title && <span className="band-title">{options.title}</span>}
          {options.label && (
            <label className="band-label" htmlFor="popup-input">
              {options.label}
            </label>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        id="popup-input"
        className={`field${invalid ? ' is-invalid' : ''}`}
        {...inputAttrs}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setInvalid(false)
        }}
      />
      {max !== undefined && <span className="max">/ {max}</span>}
      <span className="spacer" />
      <button className="btn btn-ghost" onClick={() => window.popup.cancel()}>
        {options.buttonLabels?.cancel ?? '取消'}
      </button>
      <button className="btn btn-primary" onClick={submit}>
        {options.buttonLabels?.ok ?? '确定'}
      </button>
      <div className="ribbon ribbon-number" ref={ribbonRef} />
    </div>
  )
}

// ===== settings =====

const shortcutKeys: { key: keyof ShortcutSettings; label: string }[] = [
  { key: 'toggleDisplay', label: '显示 / 隐藏' },
  { key: 'toggleLock', label: '锁定' },
  { key: 'prevPage', label: '上一页' },
  { key: 'nextPage', label: '下一页' },
  { key: 'exit', label: '退出' }
]

const syncOptions: { value: ReaderSettings['sync']['mode']; label: string }[] = [
  { value: 'approximate', label: '同步具体位置(存在误差)' },
  { value: 'chapter', label: '仅同步章节' }
]

// 编辑态实时校验: 非法值标红并在状态栏提示修改, 保存前拦截;
// 校验保证值合法后, 提交前仅做 trim 清洗, 不再静默回退
type SettingsErrors = {
  file?: string
  chunkSize?: string
  maxLine?: string
  regex: (string | undefined)[]
  url?: string
  directory?: string
}

async function validateSettings(draft: SettingsData): Promise<SettingsErrors> {
  const positiveInt = (value: number): string | undefined =>
    value >= 1 && Number.isInteger(value) ? undefined : '需为大于 0 的整数'
  const required = (value: string): string | undefined => (value.trim() ? undefined : '不能为空')
  const errors: SettingsErrors = {
    file: required(draft.reader.file.trim()),
    chunkSize: positiveInt(draft.reader.chunkSize),
    maxLine: positiveInt(draft.reader.maxLine),
    regex: draft.reader.txt.chapterRegex.map((item) => {
      const pattern = item.trim()
      if (!pattern) return '不能为空'
      try {
        new RegExp(pattern)
      } catch {
        return '正则不合法'
      }
      return undefined
    }),
    // WebDav 未启用时地址/目录可留空, 启用后必须配置
    url: draft.webdav.enabled ? required(draft.webdav.url) : undefined,
    directory: draft.webdav.enabled ? required(draft.webdav.directory) : undefined
  }
  if (!errors.file) {
    const exists = await window.popup.validateFile(draft.reader.file.trim())
    if (!exists) errors.file = '文件不存在'
  }
  return errors
}

function errorList(errors: SettingsErrors): string[] {
  const list: string[] = []
  const push = (message: string | undefined, label: string): void => {
    if (message) list.push(`${label}: ${message}`)
  }
  push(errors.file, '阅读: 阅读文件')
  push(errors.chunkSize, '阅读: 每行字符数')
  push(errors.maxLine, '阅读: 每次展示行数')
  push(errors.url, 'WebDav 同步: 地址')
  push(errors.directory, 'WebDav 同步: 目录')
  errors.regex.forEach((message, index) => {
    if (message) list.push(`阅读: 章节正则 #${index + 1}: ${message}`)
  })
  return list
}

function firstErrorKey(errors: SettingsErrors): string {
  if (errors.file) return 'file'
  if (errors.chunkSize) return 'chunkSize'
  if (errors.maxLine) return 'maxLine'
  const regexIndex = errors.regex.findIndex((message) => message !== undefined)
  if (regexIndex >= 0) return `regex:${regexIndex}`
  if (errors.url) return 'url'
  return 'directory'
}

function SettingsPanel({ data }: { data: SettingsData }): React.JSX.Element {
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
    <div className="panel" role="dialog" aria-modal="true" aria-label="设置">
      <header className="panel-bar">
        <span className="panel-title">设置</span>
        <button
          className="icon-btn"
          aria-label="关闭"
          onClick={() => {
            void closePopup()
          }}
        >
          ✕
        </button>
      </header>

      <div className="panel-body">
        <div className="sect">阅读</div>

        <label className="row">
          <span className="row-key">阅读文件</span>
          <input
            className={`input input-flex is-mono${errors.file ? ' is-invalid' : ''}`}
            type="text"
            value={draft.reader.file}
            ref={registerField('file')}
            onChange={(event) => setDraft('reader', 'file', event.target.value)}
          />
          <button
            className="link-btn"
            onClick={async () => {
              const path = await window.popup.pickFile({ title: '选择阅读文件' })
              if (!path) return
              setDraft('reader', 'file', path)
            }}
          >
            选择
          </button>
        </label>

        <label className="row">
          <span className="row-key">每行字符数</span>
          <input
            className={`input input-number${errors.chunkSize ? ' is-invalid' : ''}`}
            type="number"
            min="1"
            value={draft.reader.chunkSize}
            ref={registerField('chunkSize')}
            onChange={(event) => setDraft('reader', 'chunkSize', Number(event.target.value))}
          />
        </label>

        <label className="row">
          <span className="row-key">每次展示行数</span>
          <input
            className={`input input-number${errors.maxLine ? ' is-invalid' : ''}`}
            type="number"
            min="1"
            value={draft.reader.maxLine}
            ref={registerField('maxLine')}
            onChange={(event) => setDraft('reader', 'maxLine', Number(event.target.value))}
          />
        </label>

        <div className="row">
          <span className="row-key">同步粒度</span>
          <div className="radio-group">
            {syncOptions.map((option) => (
              <label className="radio" key={option.value}>
                <input
                  type="radio"
                  name="syncMode"
                  checked={draft.reader.sync.mode === option.value}
                  onChange={() => setDraft('reader', 'sync', { mode: option.value })}
                />
                <span className="radio-mark" />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="row row-block">
          <span className="row-key">章节正则</span>
          <div className="regex-list">
            {currentRegex().map((regex, index) => (
              <div className="regex-item" key={index}>
                <input
                  className={`input input-flex is-mono${errors.regex[index] ? ' is-invalid' : ''}`}
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
                  className="link-btn link-danger"
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
              className="link-btn"
              onClick={() => setDraft('reader', 'txt', { chapterRegex: [...currentRegex(), ''] })}
            >
              + 添加
            </button>
          </div>
        </div>

        <div className="sect">WebDav 同步</div>

        <div className="row">
          <span className="row-key">启用</span>
          <button
            className={`switch${draft.webdav.enabled ? ' is-on' : ''}`}
            role="switch"
            aria-checked={draft.webdav.enabled}
            onClick={() => setDraft('webdav', 'enabled', !draft.webdav.enabled)}
          />
        </div>

        <label className="row">
          <span className="row-key">地址</span>
          <input
            className={`input input-flex is-mono${errors.url ? ' is-invalid' : ''}`}
            type="text"
            value={draft.webdav.url}
            ref={registerField('url')}
            onChange={(event) => setDraft('webdav', 'url', event.target.value)}
          />
        </label>

        <label className="row">
          <span className="row-key">用户名</span>
          <input
            className="input input-flex is-mono"
            type="text"
            value={draft.webdav.username}
            onChange={(event) => setDraft('webdav', 'username', event.target.value)}
          />
        </label>

        <label className="row">
          <span className="row-key">密码</span>
          <input
            className="input input-flex is-mono"
            type="password"
            value={draft.webdav.password}
            onChange={(event) => setDraft('webdav', 'password', event.target.value)}
          />
        </label>

        <label className="row">
          <span className="row-key">目录</span>
          <input
            className={`input input-flex is-mono${errors.directory ? ' is-invalid' : ''}`}
            type="text"
            value={draft.webdav.directory}
            ref={registerField('directory')}
            onChange={(event) => setDraft('webdav', 'directory', event.target.value)}
          />
        </label>

        <div className="sect">快捷键</div>

        <div className="shortcut-grid">
          {shortcutKeys.map(({ key, label }) => (
            <div className="shortcut-row" key={key}>
              <span className="row-key">{label}</span>
              <input
                className="input input-flex is-mono"
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

      <footer className="status">
        <span className="status-path">{configDir}</span>
        <span
          className={`status-save${dirty ? ' is-dirty' : ''}${errorTexts.length ? ' has-error' : ''}`}
        >
          {errorTexts.length === 0
            ? dirty
              ? '未保存'
              : '已保存'
            : errorTexts.length === 1
              ? errorTexts[0]
              : `${errorTexts[0]} 等 ${errorTexts.length} 处`}
        </span>
        <span className="spacer" />
        <span className="status-hint">Esc 关闭</span>
        <span className="status-hint">Ctrl+S 保存</span>
      </footer>
    </div>
  )
}
