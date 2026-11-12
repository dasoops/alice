import { defineConfig } from 'electron-vite'
import { execFileSync } from 'node:child_process'
import { resolve } from 'path'
import { version } from './package.json'

type Channel = 'dev' | 'snapshot' | 'release'

// 源码 tarball 等无仓库环境下 git 不可用, 回退到 package.json
const git = (...args: string[]): string | null => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return null
  }
}

// --long 保证正好在 tag 上也输出 <tag>-0-g<sha>; --always 保证无 tag 时回退到提交号
const described = git(
  'describe',
  '--tags',
  '--long',
  '--dirty',
  '--always',
  '--abbrev=7',
  '--match',
  'v[0-9]*'
)
const dirty = described?.endsWith('-dirty') ?? false
// base 缺失时回退到 package.json 版本; sha 缺失说明 git 不可用
const [, base = version, distance, sha = 'unknown'] =
  described?.match(/^(?:v?(\d+\.\d+\.\d+)-(\d+)-g)?([0-9a-f]+)(?:-dirty)?$/) ?? []

function resolveVersion(channel: Channel): string {
  // 正式版版本号本身不含 commit, 构建期直接拼入
  if (channel === 'release') return sha === 'unknown' ? version : `${version}+${sha}`
  // 非正式版用 semver prerelease, 排序低于同版本正式包, 避免被更新逻辑误判为更新版本
  const prerelease = distance ? `${channel}.${distance}.${sha}` : `${channel}.${sha}`
  return `${base}-${prerelease}${dirty ? '.dirty' : ''}`
}

export default defineConfig(({ command, mode }) => {
  // release 由发布脚本显式传入; dev server 用 dev; 其余构建视为 snapshot
  const channel: Channel = mode === 'release' ? 'release' : command === 'serve' ? 'dev' : 'snapshot'

  // main / preload / renderer 共用同一份, 主进程后续也可直接使用
  const define = { __APP_VERSION__: JSON.stringify(resolveVersion(channel)) }

  return {
    main: {
      define,
      build: {
        externalizeDeps: {
          // @lingo-reader/epub-parser 声明 type:module 却以 cjs 内容提供 require 入口,
          // 外置后 require() 会在 node 中报错, 故强制打包其 ESM 构建
          exclude: ['@lingo-reader/epub-parser']
        }
      }
    },
    preload: {
      define,
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
      define,
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/renderer/index.html'),
            popup: resolve(__dirname, 'src/renderer/popup.html')
          }
        }
      }
    }
  }
})
