import { describe, expect, it } from 'vitest'
import { ProgressSync } from './sync'
import { bookProgressFileName, type BookMeta, type BookProgress } from './progress'
import type { WebDavClient } from '../../webdav'

const book: BookMeta = { name: '书', author: '作' }
const remote: BookProgress = {
  name: '书',
  author: '作',
  durChapterIndex: 3,
  durChapterPos: 120,
  durChapterTime: 0,
  durChapterTitle: '第三章'
}
const local: BookProgress = {
  name: '书',
  author: '作',
  durChapterIndex: 1,
  durChapterPos: 10,
  durChapterTime: 1,
  durChapterTitle: '第一章'
}

const progressPath = (meta: BookMeta): string =>
  `bookProgress/${bookProgressFileName(meta.name, meta.author)}`

// 假 WebDav 客户端: 不依赖 electron, 记录调用顺序/参数, 可注入响应并阻塞首个 get
class FakeWebDav {
  public enabledFlag = true
  public response: { status: number; text: string } = { status: 404, text: '' }
  public readonly events: string[] = []
  public readonly puts: { path: string; body: string }[] = []
  // 阻塞首个 get, 用于验证队列串行
  private blocked?: Promise<void>
  private release?: () => void

  public enabled(): boolean {
    return this.enabledFlag
  }

  public async get(path: string): Promise<{ status: number; text: string }> {
    this.events.push(`get:${path}`)
    const blocked = this.blocked
    if (blocked) {
      this.blocked = undefined
      await blocked
    }
    return this.response
  }

  public async put(path: string, body: string): Promise<void> {
    this.events.push(`put:${path}`)
    this.puts.push({ path, body })
  }

  public async ensureDirs(...path: string[]): Promise<void> {
    this.events.push(`ensureDirs:${path.join('/')}`)
  }

  public blockNextGet(): void {
    let release = (): void => undefined
    this.blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    this.release = release
  }

  public releaseGet(): void {
    this.release?.()
  }
}

const createSync = (
  webdav: FakeWebDav,
  mode: 'approximate' | 'chapter' = 'approximate'
): ProgressSync => new ProgressSync({ mode, webdav: webdav as unknown as WebDavClient })

// 等待微任务全部结算, 用于断言队列中的任务尚未开始
const tick = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('ProgressSync.fetch', () => {
  it('远端 404 视为无进度, 返回 undefined', async () => {
    const webdav = new FakeWebDav()
    const sync = createSync(webdav)

    await expect(sync.fetch(book)).resolves.toBeUndefined()
    expect(webdav.events).toEqual([`get:${progressPath(book)}`])
  })

  it('远端 200 解析 JSON 返回进度', async () => {
    const webdav = new FakeWebDav()
    webdav.response = { status: 200, text: JSON.stringify(remote) }
    const sync = createSync(webdav)

    await expect(sync.fetch(book)).resolves.toEqual(remote)
  })

  it('非 404/200 抛出错误', async () => {
    const webdav = new FakeWebDav()
    webdav.response = { status: 500, text: '' }
    const sync = createSync(webdav)

    await expect(sync.fetch(book)).rejects.toThrow('get progress failed: 500')
  })
})

describe('ProgressSync.push', () => {
  it('写入 JSON 内容与 legado 进度路径', async () => {
    const webdav = new FakeWebDav()
    const sync = createSync(webdav)

    await sync.push(book, local)
    expect(webdav.events).toEqual(['ensureDirs:bookProgress', `put:${progressPath(book)}`])
    expect(webdav.puts).toHaveLength(1)
    expect(webdav.puts[0].path).toBe(progressPath(book))
    expect(JSON.parse(webdav.puts[0].body)).toEqual(local)
  })

  it('未启用时不写入', async () => {
    const webdav = new FakeWebDav()
    webdav.enabledFlag = false
    const sync = createSync(webdav)

    await sync.push(book, local)
    expect(webdav.puts).toEqual([])
    expect(webdav.events).toEqual([])
  })
})

describe('ProgressSync 串行队列', () => {
  it('sync 未完成时 push 不开始, 完成后按入队顺序执行', async () => {
    const webdav = new FakeWebDav()
    const sync = createSync(webdav)

    // 第一个任务阻塞在 get
    webdav.blockNextGet()
    const syncing = sync.sync(book, () => local)
    const pushing = sync.push(book, local)
    await tick()

    // push 的 ensureDirs 尚未调用, 证明队列串行
    expect(webdav.events).toEqual(['ensureDirs:bookProgress', `get:${progressPath(book)}`])

    webdav.releaseGet()
    await syncing
    await pushing
    // sync: 404 -> 本地领先 -> put; 之后才轮到 push
    expect(webdav.events).toEqual([
      'ensureDirs:bookProgress',
      `get:${progressPath(book)}`,
      `put:${progressPath(book)}`,
      'ensureDirs:bookProgress',
      `put:${progressPath(book)}`
    ])
  })

  it('前一个任务失败不阻塞后续任务', async () => {
    const webdav = new FakeWebDav()
    const sync = createSync(webdav)

    webdav.response = { status: 500, text: '' }
    await expect(sync.sync(book, () => local)).rejects.toThrow('get progress failed: 500')

    await sync.push(book, local)
    expect(webdav.puts).toHaveLength(1)
  })
})
