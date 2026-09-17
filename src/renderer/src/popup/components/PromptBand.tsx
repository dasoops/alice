import React, { useEffect, useRef, useState } from 'react'
import shared from '../styles/shared.module.css'
import styles from './PromptBand.module.css'
import type { PopupPromptOptions } from '../../../../main/popup/types'

export function PromptBand({ options }: { options: PopupPromptOptions }): React.JSX.Element {
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
      className={`${styles.band} ${styles['band-prompt']}`}
      role="dialog"
      aria-modal="true"
      data-band=""
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
      <span className={`${styles.lead} ${styles['lead-prompt']}`} aria-hidden="true">
        ❯
      </span>
      {(options.title || options.label) && (
        <div className={styles['band-text']}>
          {options.title && <span className={styles['band-title']}>{options.title}</span>}
          {options.label && (
            <label className={styles['band-label']} htmlFor="popup-input">
              {options.label}
            </label>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        id="popup-input"
        className={`${styles.field}${invalid ? ` ${styles['is-invalid']}` : ''}`}
        {...inputAttrs}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setInvalid(false)
        }}
      />
      {max !== undefined && <span className={styles.max}>/ {max}</span>}
      <span className={shared.spacer} />
      <button
        className={`${shared.btn} ${shared['btn-ghost']}`}
        onClick={() => window.popup.cancel()}
      >
        {options.buttonLabels?.cancel ?? '取消'}
      </button>
      <button className={`${shared.btn} ${shared['btn-primary']}`} onClick={submit}>
        {options.buttonLabels?.ok ?? '确定'}
      </button>
      <div className={`${styles.ribbon} ${styles['ribbon-number']}`} ref={ribbonRef} />
    </div>
  )
}
