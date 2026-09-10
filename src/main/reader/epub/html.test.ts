import { describe, expect, it } from 'vitest'
import { lineSeparator } from '../../constants'
import { htmlToText } from './html'

describe('htmlToText', () => {
  it('块级元素之间生成换行', () => {
    expect(htmlToText('<p>第一段</p><p>第二段</p>')).toBe(['第一段', '第二段'].join(lineSeparator))
  })

  it('br 转为换行', () => {
    expect(htmlToText('第一行<br />第二行')).toBe(['第一行', '第二行'].join(lineSeparator))
  })

  it('剔除 script/style/nav 等非正文节点', () => {
    expect(
      htmlToText('<p>正文</p><script>var x = 1</script><style>p{color:red}</style><nav>导航</nav>')
    ).toBe('正文')
  })

  it('行内元素不拆行', () => {
    expect(htmlToText('<p>foo <b>bar</b> baz</p>')).toBe('foo bar baz')
  })

  it('HTML 实体解码', () => {
    expect(htmlToText('<p>a&amp;b &lt;c&gt;</p>')).toBe('a&b <c>')
  })

  it('标题/列表等块级元素分行', () => {
    expect(htmlToText('<h1>标题</h1><ul><li>甲</li><li>乙</li></ul>')).toBe(
      ['标题', '甲', '乙'].join(lineSeparator)
    )
  })

  it('无正文时返回空串', () => {
    expect(htmlToText('')).toBe('')
    expect(htmlToText('<nav>导航</nav>')).toBe('')
  })
})
