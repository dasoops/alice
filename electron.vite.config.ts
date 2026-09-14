import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        // @lingo-reader/epub-parser 声明 type:module 却以 cjs 内容提供 require 入口,
        // 外置后 require() 会在 node 中报错, 故强制打包其 ESM 构建
        exclude: ['@lingo-reader/epub-parser']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          popup: resolve(__dirname, 'src/preload/popup.ts')
        }
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          popup: resolve(__dirname, 'src/renderer/popup.html')
        }
      }
    }
  }
})
