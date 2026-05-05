// 从 LLM 输出文本提取 JSON
//
// 模型有时会乖乖只输出 JSON,有时会:
//   - 在 JSON 前后加自然语言解释
//   - 用 ```json ``` fence 包起来
//   - 在 JSON 末尾多一个换行或 markdown
//
// 这个函数尽力提取出第一个完整 JSON 对象,parse 失败抛 JsonExtractError。

export class JsonExtractError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message)
    this.name = 'JsonExtractError'
  }
}

/**
 * 从 LLM 输出提取 JSON 对象。返回 unknown,调用方自己做类型校验。
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()

  // 路径 1:整段就是 JSON
  try {
    return JSON.parse(trimmed)
  } catch {
    // 继续往下试
  }

  // 路径 2:```json ... ``` 或 ``` ... ``` fence
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/)
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1])
    } catch {
      // 继续
    }
  }

  // 路径 3:第一个 { 到最后一个 }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      // 继续
    }
  }

  // 路径 4:数组场景 [...]
  const arrStart = trimmed.indexOf('[')
  const arrEnd = trimmed.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(trimmed.slice(arrStart, arrEnd + 1))
    } catch {
      // 继续
    }
  }

  throw new JsonExtractError(
    `JSON 提取失败: 原文前 200 字 = ${trimmed.slice(0, 200)}`,
    trimmed,
  )
}
