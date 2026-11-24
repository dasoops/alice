import * as fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 卷分组依赖 epub-parser 的 getNavToc 补丁; 补丁被跳过(重装依赖未执行 postinstall)时
// 类型/运行时会静默失效(或直接崩溃), 这里用产物文本把问题提前暴露在测试阶段
const dist = path.join(process.cwd(), 'node_modules/@lingo-reader/epub-parser/dist')

describe('epub-parser patch', () => {
  it('运行时产物暴露 getNavToc', () => {
    const runtime = fs.readFileSync(path.join(dist, 'index.node.mjs'), 'utf-8')
    expect(runtime).toContain('getNavToc')
  })

  it('类型声明暴露 getNavToc', () => {
    const types = fs.readFileSync(path.join(dist, 'index.d.ts'), 'utf-8')
    expect(types).toContain('getNavToc')
  })
})
