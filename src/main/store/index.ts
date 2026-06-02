import EventEmitter from 'node:events'

export class Store extends EventEmitter {
  private _display = true
  private _lock = true

  public get lock(): boolean {
    return this._lock
  }

  public set lock(newValue: boolean) {
    this.emit('lock', newValue, this._lock)
    this._lock = newValue
  }

  public get display(): boolean {
    return this._display
  }

  public set display(newValue: boolean) {
    this.emit('display', newValue, this._display)
    this._display = newValue
  }
}
