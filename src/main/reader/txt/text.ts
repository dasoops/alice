import { lineSeparator } from '../../constants'

// 行尾归一化: \r\n/\r/\n 统一为 lineSeparator, 丢弃空行
// 空行判定为 length === 0, 纯空白行保留, 与旧缓存文件的逐字符归一化行为一致
export function normalizeText(raw: string): string {
  return raw
    .split(/\r\n|\r|\n/)
    .filter((line) => line.length > 0)
    .join(lineSeparator)
}
