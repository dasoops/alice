import { defineConfig } from 'vitest/config'

// 预设 CSS 通过 Vite 的 ?raw 内联; Vitest 默认把 CSS 置为空模块, 开启处理才能读到原文
export default defineConfig({
  test: { css: true }
})
