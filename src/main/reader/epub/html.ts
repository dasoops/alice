import * as cheerio from 'cheerio'
import { lineSeparator } from '../../constants'
import { normalizeText } from '../text'

// 块级元素, 在文本提取时充当段落边界
const blockSelector =
  'p,div,h1,h2,h3,h4,h5,h6,li,tr,td,th,blockquote,pre,section,article,' +
  'figcaption,dt,dd,ul,ol,table,address,aside,footer,header,figure,summary,details'

// 由章节 body 片段提取纯文本: 块级元素与 <br> 转为行, 剔除样式/脚本/导航
export function htmlToText(html: string): string {
  const $ = cheerio.load(html)
  $('head,script,style,noscript,nav,svg').remove()
  $('br').replaceWith(lineSeparator)
  $(blockSelector).each((_, element) => {
    $(element).append(lineSeparator)
  })
  return normalizeText($.root().text())
}
