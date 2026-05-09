// 老白prompt 加载器
//
// 优先级(spec-027):
// 1. DB(prompt_versions 表 deployed 版本)— 运营在 admin 改的版本
// 2. fallback 到 inline 默认(default-prompts.ts,从 .md 蒸馏出来)
//
// 不再依赖文件系统(Railway 部署 dev-kit 文件夹访问不到)
// 5min cache 进程内,改了 prompt 调 invalidatePromptCache(name) 清掉
//
// 历史变更:之前 fallback 是 readFile() lianai-dev-kit/03-prompts/<name>.md,
// Railway 部署后 dev-kit 文件夹不在容器里,导致全部"未配置"。改成 inline 兜底。

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'
import { getDefaultPrompt } from './default-prompts.js'

export type PromptName =
  | 'parsing'
  | 'reflecting'
  | 'diagnosing'
  | 'planning'
  | 'drafting'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// apps/api/src/ai → repo 根 → lianai-dev-kit/03-prompts(仅 dev 模式 / 测试用)
const DEFAULT_PROMPTS_DIR = path.resolve(
  __dirname,
  '../../../../lianai-dev-kit/03-prompts',
)

interface CachedPrompt {
  content: string
  cached_at: number
  source: 'db' | 'file'
}
const cache = new Map<string, CachedPrompt>()
const CACHE_TTL_MS = 5 * 60_000 // 5 分钟

export interface LoadPromptOptions {
  /** 覆盖默认 prompts 目录,主要给测试用 */
  promptsDir?: string
  /** 跳过缓存 */
  noCache?: boolean
  /** 跳过 DB 查询(测试 / 故障兜底用)*/
  skipDb?: boolean
}

/**
 * 加载 prompt:DB 优先,fallback .md
 * 5 分钟 cache;admin 改 prompt 后调 invalidatePromptCache(name)
 */
export async function loadPrompt(
  name: PromptName,
  opts: LoadPromptOptions = {},
): Promise<string> {
  const dir = opts.promptsDir ?? DEFAULT_PROMPTS_DIR
  const cacheKey = `${dir}::${name}`
  const now = Date.now()

  if (!opts.noCache) {
    const cached = cache.get(cacheKey)
    if (cached && now - cached.cached_at < CACHE_TTL_MS) {
      return cached.content
    }
  }

  // ① 先查 DB(spec-027)
  if (!opts.skipDb && !opts.promptsDir) {
    try {
      const deployed = await prisma.promptVersion.findFirst({
        where: { name, deployed_at: { not: null }, rolled_back_at: null },
        orderBy: { deployed_at: 'desc' },
        select: { content: true, version: true },
      })
      if (deployed) {
        cache.set(cacheKey, { content: deployed.content, cached_at: now, source: 'db' })
        return deployed.content
      }
    } catch (e) {
      logger.warn(
        { err: e, name, event: 'prompt_loader.db_failed' },
        '[prompt-loader] DB 查询失败,fallback 到 .md',
      )
      // 继续走 file fallback
    }
  }

  // ② Fallback 到 inline 默认(spec-027 修复:Railway 上读不到 .md,改用代码内 const)
  // 测试 / dev 模式可以传 promptsDir 强制读 .md
  if (opts.promptsDir) {
    const filePath = path.join(dir, `${name}.md`)
    const md = await readFile(filePath, 'utf-8')
    const prompt = extractSystemPrompt(md, name)
    if (!opts.noCache) {
      cache.set(cacheKey, { content: prompt, cached_at: now, source: 'file' })
    }
    return prompt
  }

  const inlinePrompt = getDefaultPrompt(name)
  if (!inlinePrompt) {
    throw new Error(`prompt "${name}" 既无 DB deployed,inline 默认也找不到`)
  }
  if (!opts.noCache) {
    cache.set(cacheKey, { content: inlinePrompt, cached_at: now, source: 'file' })
  }
  return inlinePrompt
}

/** Admin 改 prompt 后调,清掉单 prompt cache 让下次调用读最新 */
export function invalidatePromptCache(name?: PromptName): void {
  if (name) {
    // 清所有以 ::<name> 结尾的 key
    for (const key of cache.keys()) {
      if (key.endsWith(`::${name}`)) cache.delete(key)
    }
  } else {
    cache.clear()
  }
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
