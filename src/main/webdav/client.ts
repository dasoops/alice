import { net } from 'electron'
import { Conf } from 'electron-conf'
import log from 'electron-log/main'

export type Config = {
  enabled: boolean
  url: string
  username: string
  password: string
  directory: string
}

export const Config: { Default: Config } = {
  Default: { enabled: false, url: '', username: '', password: '', directory: 'legado' }
}

const REQUEST_TIMEOUT = 15000

export class WebDavClient {
  private readonly conf: Conf<Config>
  private readonly dirsReady = new Set<string>()

  constructor(conf: Conf<Config>) {
    this.conf = conf
  }

  public enabled(): boolean {
    return this.conf.get('enabled') ?? false
  }

  public async get(path: string): Promise<{ status: number; text: string }> {
    return await this.request('GET', this.withDirectory(path))
  }

  public async put(path: string, body: string, contentType = 'application/json'): Promise<void> {
    const { status } = await this.request('PUT', this.withDirectory(path), body, contentType)
    if (status < 200 || status >= 300) throw Error(`webdav put failed: ${status}`)
  }

  public async ensureDirs(...path: string[]): Promise<void> {
    // 数组按引用比较无法作为缓存键, 用 join 后的字符串
    const key = path.join('/')
    if (this.dirsReady.has(key)) return
    const segments = [this.directory(), ...path]
    let current = ''
    for (const it of segments) {
      current = current ? `${current}/${it}` : it
      await this.mkcol(current)
    }
    this.dirsReady.add(key)
  }

  private directory(): string {
    return this.conf.get('directory')
  }

  private withDirectory(path: string): string {
    return `${this.directory()}/${path}`
  }

  public async mkcol(path: string): Promise<void> {
    const { status } = await this.request('MKCOL', path)
    // 405 = 目录已存在
    if ((status < 200 || status >= 300) && status !== 405) {
      throw Error(`webdav mkcol failed: ${status}`)
    }
  }

  private authHeader(): string {
    const credentials = Buffer.from(
      `${this.conf.get('username')}:${this.conf.get('password')}`,
      'utf-8'
    )
    return `Basic ${credentials.toString('base64')}`
  }

  private async request(
    method: string,
    path: string,
    body?: string,
    contentType?: string
  ): Promise<{ status: number; text: string }> {
    // 基址不带尾斜杠时 new URL 会把最后一段当文件名替换掉, 统一补齐
    const base = this.conf.get('url')
    const url = new URL(path, base.endsWith('/') ? base : `${base}/`)

    const headers: Record<string, string> = { Authorization: this.authHeader() }
    if (body !== undefined && contentType) headers['Content-Type'] = contentType

    log.info(`WebDav ==> ${method} ${url.href}`)
    try {
      const response = await net.fetch(url.href, {
        method: method,
        headers: headers,
        body: body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      })
      const text = await response.text()
      log.info(`WebDav ==> ${method} ${path} -> ${response.status}`)
      return { status: response.status, text }
    } catch (err) {
      log.warn(`WebDav ==> ${method} ${path} failed: ${err}`)
      throw err
    }
  }
}
