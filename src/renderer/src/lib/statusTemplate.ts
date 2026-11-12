// 阅读进度模板变量
export const statusTemplateVars = ['chapter', 'page', 'total', 'percent'] as const

export type StatusTemplateVar = (typeof statusTemplateVars)[number]

export type StatusTemplateValues = Record<StatusTemplateVar, string>

const TOKEN_RE = /\{([^{}]+)}/g

export function renderStatusTemplate(template: string, values: StatusTemplateValues): string {
  return template
    .replace(TOKEN_RE, (token, name: string) =>
      name in values ? values[name as StatusTemplateVar] : token
    )
    .replace(/\s+/g, ' ')
    .trim()
}
