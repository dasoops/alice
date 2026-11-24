// 构建期由 electron.vite.config.ts 的 define 注入
declare const __APP_VERSION__: string

// Vite 的 ?raw 在构建期内联文件内容(类似 go:embed), tsc 需此声明才能识别
declare module '*.css?raw' {
  const css: string
  export default css
}
