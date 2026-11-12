import { describe, expect, it } from 'vitest'
import { renderStatusTemplate } from './statusTemplate'

const values = { chapter: '第1章', page: '21', total: '23', percent: '45' }

describe('renderStatusTemplate', () => {
  it('替换全部模板变量', () => {
    expect(renderStatusTemplate('{chapter} {page}/{total} {percent}%', values)).toBe(
      '第1章 21/23 45%'
    )
  })

  it('未知变量保持原样', () => {
    expect(renderStatusTemplate('{chapter} {foo}', values)).toBe('第1章 {foo}')
  })
})
