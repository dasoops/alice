import React, { useEffect, useRef } from 'react'
import shared from '../styles/shared.module.css'
import styles from './MessageBand.module.css'
import type { PopupMessageOptions } from '../../../../main/popup/types'

export function MessageBand({ options }: { options: PopupMessageOptions }): React.JSX.Element {
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
      className={`${styles.band} band-${type}`}
      role={type === 'error' ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      data-band=""
    >
      <span className={`${styles.lead} ${styles[`lead-${type}`]}`} aria-hidden="true">
        {leadGlyph(type)}
      </span>
      <div className={styles['band-text']}>
        {options.title && <span className={styles['band-title']}>{options.title}</span>}
        <span className={styles['band-message']}>{options.message}</span>
        {options.detail && <span className={styles['band-detail']}>{options.detail}</span>}
      </div>
      <span className={shared.spacer} />
      {buttons.map((label, index) => (
        <button
          key={index}
          ref={index === defaultId ? defaultBtnRef : undefined}
          className={
            index === defaultId
              ? `${shared.btn} ${shared['btn-primary']}`
              : `${shared.btn} ${shared['btn-ghost']}`
          }
          onClick={() => window.popup.resolve(index)}
        >
          {label}
        </button>
      ))}
      <div
        className={`${styles.ribbon} ${
          type === 'error' ? styles['ribbon-danger'] : styles['ribbon-accent']
        }`}
      />
    </div>
  )
}

function leadGlyph(type: PopupMessageOptions['type']): string {
  if (type === 'error') return '✗'
  if (type === 'warning') return '!'
  if (type === 'question') return '?'
  return 'ⓘ'
}
