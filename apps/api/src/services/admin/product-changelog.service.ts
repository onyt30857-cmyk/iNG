// 产品迭代记录 service(spec-022)
//
// 4 个能力:
// - listChangelogs: 列表(支持按月 / category / scope 过滤)
// - createChangelog / updateChangelog / deleteChangelog: CRUD
// - generateDraftFromGit: 从 git log 用 Haiku 浓缩成草稿(spec-022 关键功能)
//
// 设计:
// - 不让运营手写大量内容,LLM 草稿 + 运营 review + 编辑 + 发布
// - 运营每周点 1 次"生成草稿"足够维护

import { prisma } from '../../lib/prisma.js'
import { errors } from '../../lib/error.js'
import { callClaude, type AiCallContext } from '../../ai/client.js'
import { logger } from '../../lib/logger.js'
import { execSync } from 'node:child_process'

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

const VALID_CATEGORIES = ['feature', 'improve', 'fix', 'remove', 'breaking'] as const
type Category = (typeof VALID_CATEGORIES)[number]

const VALID_SCOPES = ['user', 'admin', 'internal'] as const
type Scope = (typeof VALID_SCOPES)[number]

export interface ListFilter {
  /** YYYY-MM-DD,只返该日期之后的 */
  since?: string
  /** YYYY-MM-DD,只返该日期之前的 */
  until?: string
  category?: Category
  scope?: Scope
  page?: number
  pageSize?: number
}

export async function listChangelogs(filter: ListFilter = {}) {
  const where: import('@prisma/client').Prisma.ProductChangelogWhereInput = {}
  if (filter.since) where.date = { ...((where.date as object) ?? {}), gte: filter.since }
  if (filter.until) where.date = { ...((where.date as object) ?? {}), lte: filter.until }
  if (filter.category) where.category = filter.category
  if (filter.scope) where.scope = filter.scope

  const page = filter.page ?? 1
  const pageSize = Math.min(filter.pageSize ?? 50, 200)

  const [total, items] = await Promise.all([
    prisma.productChangelog.count({ where }),
    prisma.productChangelog.findMany({
      where,
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { items, total, page, pageSize }
}

export interface CreateInput {
  date: string
  category: Category
  title: string
  description?: string | null
  scope?: Scope
}

export async function createChangelog(adminId: string, input: CreateInput) {
  if (!VALID_CATEGORIES.includes(input.category)) {
    throw errors.validation(`category 必须是 ${VALID_CATEGORIES.join(' / ')}`)
  }
  if (input.scope && !VALID_SCOPES.includes(input.scope)) {
    throw errors.validation(`scope 必须是 ${VALID_SCOPES.join(' / ')}`)
  }
  if (!input.title.trim()) throw errors.validation('title 不能空')
  if (input.title.length > 100) throw errors.validation('title 最多 100 字')

  return prisma.productChangelog.create({
    data: {
      date: input.date,
      category: input.category,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      scope: input.scope ?? 'user',
      created_by: adminId,
    },
  })
}

export interface UpdateInput {
  date?: string
  category?: Category
  title?: string
  description?: string | null
  scope?: Scope
}

export async function updateChangelog(id: string, input: UpdateInput) {
  const exists = await prisma.productChangelog.findUnique({ where: { id } })
  if (!exists) throw errors.notFound('记录不存在')

  return prisma.productChangelog.update({
    where: { id },
    data: {
      ...(input.date && { date: input.date }),
      ...(input.category && { category: input.category }),
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && {
        description: input.description?.trim() || null,
      }),
      ...(input.scope && { scope: input.scope }),
    },
  })
}

export async function deleteChangelog(id: string) {
  const exists = await prisma.productChangelog.findUnique({ where: { id } })
  if (!exists) throw errors.notFound('记录不存在')
  await prisma.productChangelog.delete({ where: { id } })
}

// ============== LLM 从 git log 生成草稿(spec-022 关键功能)==============

export interface DraftEntry {
  date: string
  category: Category
  title: string
  description: string
  scope: Scope
  /** 从哪些 commit 浓缩出来 — 给 admin 一个交叉验证机会 */
  source_commits: string[]
}

const DRAFT_SYSTEM_PROMPT = `你帮一个产品团队浓缩 git commit 成"产品迭代记录"中文条目。

任务:把下面的 git commit 列表浓缩成 5-10 个产品级中文条目。
- 多个 commit 属于同一功能(看 spec 编号 / 主题)→ 合并成 1 条
- 工程性 commit(typecheck / 修 build / refactor 内部代码)→ 跳过,不输出
- 标题要短(< 30 字),从用户/运营视角写,不写技术细节
- description 1-2 句,说明做了什么 + 给谁用
- scope:用户能看到的 → 'user';只在 admin 后台 → 'admin';纯内部技术 → 'internal'(基本不输出)

❌ 不要的标题:"重构 conversation route"、"修了 PATCH 401"、"加了 useState"
✓ 要的标题:"用户首次进入有完整账户创建流程"、"运营能在大盘看到 30 天 dislike 趋势"

输出严格 JSON:
{
  "entries": [
    {
      "date": "YYYY-MM-DD",  // 该功能合并 commit 中最近一个的日期
      "category": "feature" | "improve" | "fix" | "remove" | "breaking",
      "title": "一句话标题(< 30 字)",
      "description": "1-2 句详情",
      "scope": "user" | "admin" | "internal",
      "source_commits": ["abc1234 第 1 行 commit message", "def5678 第 2 行..."]
    }
  ]
}

只输出 JSON,不要任何其他文字。`

interface CommitEntry {
  hash: string
  date: string
  message: string
}

/**
 * 拉指定时间窗口的 git commit
 * 在 Railway 部署的环境里 git 命令应该可用(代码本身就是从 git 拉的)
 */
function fetchCommits(sinceDate: string): CommitEntry[] {
  try {
    // git log --since='YYYY-MM-DD' --pretty=format:'%h|%ai|%s'
    const output = execSync(
      `git log --since='${sinceDate}' --pretty=format:'%h|%ai|%s' --no-merges`,
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      },
    )
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, date, ...rest] = line.split('|')
        return {
          hash: hash ?? '',
          date: (date ?? '').slice(0, 10), // YYYY-MM-DD
          message: rest.join('|'),
        }
      })
  } catch (e) {
    logger.warn({ err: e, event: 'changelog.fetch_commits.failed' }, 'git log 失败')
    return []
  }
}

export async function generateDraftFromGit(
  windowDays = 7,
): Promise<{ entries: DraftEntry[]; commits_analyzed: number }> {
  const since = new Date(Date.now() - windowDays * 86400_000)
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`

  const commits = fetchCommits(sinceStr)
  if (commits.length === 0) {
    return { entries: [], commits_analyzed: 0 }
  }

  // 拼输入
  const commitBlock = commits
    .slice(0, 200) // 上限防 prompt 爆炸
    .map((c) => `${c.hash} ${c.date} ${c.message}`)
    .join('\n')

  const userMessage = `共 ${commits.length} 个 commit(过去 ${windowDays} 天,${sinceStr} 至今):\n\n${commitBlock}`

  const ctx: AiCallContext = {
    user_id: 'system_changelog',
    relationship_id: 'system',
    scene: 'profile_update',
  }

  let response: { entries: DraftEntry[] }
  try {
    const result = await callClaude(ctx, {
      system: DRAFT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 4000,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true,
    })
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Haiku 输出找不到 JSON')
    response = JSON.parse(jsonMatch[0]) as { entries: DraftEntry[] }
  } catch (e) {
    logger.warn(
      { err: e, event: 'changelog.draft.llm_failed', commits_count: commits.length },
      'LLM 生成草稿失败',
    )
    throw errors.internal('LLM 生成草稿失败,稍后再试')
  }

  if (!Array.isArray(response.entries)) {
    return { entries: [], commits_analyzed: commits.length }
  }

  // 校验 + 兜底
  const validEntries: DraftEntry[] = response.entries
    .filter((e) => e && typeof e.title === 'string' && e.title.trim().length > 0)
    .map((e) => ({
      date: e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : sinceStr,
      category: VALID_CATEGORIES.includes(e.category as Category)
        ? (e.category as Category)
        : 'improve',
      title: e.title.trim().slice(0, 100),
      description: typeof e.description === 'string' ? e.description.trim() : '',
      scope: VALID_SCOPES.includes(e.scope as Scope) ? (e.scope as Scope) : 'user',
      source_commits: Array.isArray(e.source_commits) ? e.source_commits.slice(0, 10) : [],
    }))

  return { entries: validEntries, commits_analyzed: commits.length }
}
