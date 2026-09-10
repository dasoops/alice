import { describe, expect, it } from 'vitest'
import { flattenToc } from './toc'

describe('flattenToc', () => {
  it('展平多级目录为 id -> 标题', () => {
    const toc = [
      {
        label: '第一章',
        href: 'epub:Text/chap1.xhtml',
        id: 'c1',
        playOrder: '1',
        children: [{ label: '第一节', href: 'epub:Text/chap1.xhtml#s1', id: 'c1', playOrder: '2' }]
      },
      { label: '第二章', href: 'epub:Text/chap2.xhtml', id: 'c2', playOrder: '3' }
    ]
    expect(flattenToc(toc)).toEqual(
      new Map([
        ['c1', '第一章'],
        ['c2', '第二章']
      ])
    )
  })

  it('同 id 首次出现优先', () => {
    const toc = [
      { label: '第一章', href: 'epub:Text/c.xhtml', id: 'c', playOrder: '1' },
      { label: '副本', href: 'epub:Text/c.xhtml#a', id: 'c', playOrder: '2' }
    ]
    expect(flattenToc(toc).get('c')).toBe('第一章')
  })

  it('空目录返回空表', () => {
    expect(flattenToc([])).toEqual(new Map())
  })

  it('缺失 id 的目录项被忽略', () => {
    expect(
      flattenToc([{ label: '无 id', href: 'epub:Text/c.xhtml', id: '', playOrder: '1' }])
    ).toEqual(new Map())
  })
})
