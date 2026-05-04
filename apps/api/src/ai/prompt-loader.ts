// 老 K prompt 加载器
//
// 从 lianai-dev-kit/03-prompts/<name>.md 提取 §"System Prompt" 节里的 ``` fence 内容。
// 5 个标准状态(parsing/reflecting/diagnosing/planning/drafting)结构一致:
//   ## N. System Prompt(...)
//   <空行>
//   ```
//   <prompt 文本>
//   ```
//
// crisis 分支结构不同,后续单独处理。

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export type PromptName =
  | 'parsing'
  | 'reflecting'
  | 'diagnosing'
  | 'planning'
  | 'drafting'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// apps/api/src/ai → repo 根 → lianai-dev-kit/03-prompts
const DEFAULT_PROMPTS_DIR = path.resolve(
  __dirname,
  '../../../../lianai-dev-kit/03-prompts',
)

const cache = new Map<string, string>()

export interface LoadPromptOptions {
  /** 覆盖默认 prompts 目录,主要给测试用 */
  promptsDir?: string
  /** 跳过缓存 */
  noCache?: boolean
}

export async function loadPrompt(
  name: PromptName,
  opts: LoadPromptOptions = {},
): Promise<string> {
  const dir = opts.promptsDir ?? DEFAULT_PROMPTS_DIR
  const cacheKey = `${dir}::${name}`
  if (!opts.noCache && cache.has(cacheKey)) return cache.get(cacheKey)!

  const filePath = path.join(dir, `${name}.md`)
  const md = await readFile(filePath, 'utf-8')
  const prompt = extractSystemPrompt(md, name)

  if (!opts.noCache) cache.set(cacheKey, prompt)
  return prompt
}

/**
 * 从 markdown 提取 System Prompt 节里的第一个 fence 内容。
 * 锚点:以 `## ` 起始且标题包含 "System Prompt" 的节。
 *
 * 注意:某些 prompt 文件(如 diagnosing.md)在 §5 内部用了 `## A. xxx` 这种
 * 不规范的子标题。所以**不能**用"下一个 `## `"做边界,直接从锚点后找第一个 fence。
 */
export function extractSystemPrompt(md: string, name: string): string {
  const lines = md.split('\n')

  let anchorLineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line && line.startsWith('## ') && line.includes('System Prompt')) {
      anchorLineIdx = i
      break
    }
  }
  if (anchorLineIdx === -1) {
    throw new Error(
      `prompt "${name}":找不到 System Prompt 节(标题需含 "System Prompt")`,
    )
  }

  const after = lines.slice(anchorLineIdx + 1).join('\n')
  const match = after.match(/^```[a-z]*\n([\s\S]*?)\n```/m)
  if (!match || !match[1]) {
    throw new Error(
      `prompt "${name}":System Prompt 节里找不到 \`\`\` fence`,
    )
  }
  return match[1].trim()
}

/** 主要给测试用 */
export function clearPromptCache(): void {
  cache.clear()
}
