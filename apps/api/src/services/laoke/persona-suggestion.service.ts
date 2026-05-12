// Module 4 Persona Auto-Suggestion — M3.0 Item 12(2026-05-12)
// 见 lianai-dev-kit-m3-v2/00-ROADMAP.md Item 12
//   + lianai-dev-kit-m3-v2/01-LAOKE-CONSTITUTION.md
//
// 用途:周分析(每周 cron)读 auto_lint + failure case → 生成 LaokePersona 字段更新建议
// 经 constitution-check 5 铁律预审 → 通过写入 PersonaSuggestion 表 admin 审核
//
// 数据周期:Module 1(auto_lint)+ Module 2(failure case)累积 3 个月+ 才有意义
// 代码层先 ship,Sam 决定何时启动 cron。
//
// 失败语义:全 catch + log,不阻塞。

import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'
import { callClaude, type AiCallContext } from '../../ai/client.js'
import {
  checkAgainstConstitution,
  type PersonaUpdateProposal,
} from '../../ai/constitution-check.js'

const HAIKU_MODEL_ID = 'claude-haiku-4-5'

/**
 * 周分析(每周 cron 调一次):
 *   1. 读最近 7 天 auto_lint pattern + 用户 dislike + admin 标 ≤2 分的 failure case
 *   2. Haiku 分析"哪些模式反复出现 + 怎么改 LaokePersona"
 *   3. constitution-check 预审 → 通过写入 PersonaSuggestion(status='pending')
 *
 * adminUserId: 系统标识,数据出处 audit 用('system')
 */
export async function runWeeklyPersonaAnalysis(input: {
  adminUserId?: string
  windowDays?: number
}): Promise<{ generated: number; rejected: number }> {
  const windowDays = input.windowDays ?? 7
  const since = new Date(Date.now() - windowDays * 86400_000)

  try {
    // 1. 拉数据源
    const autoLints = await prisma.promptFeedback.findMany({
      where: {
        feedback_type: 'auto_lint',
        created_at: { gt: since },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
      select: { id: true, feedback_note: true },
    })

    const failures = await prisma.learningCase.findMany({
      where: {
        type: 'failure',
        created_at: { gt: since },
        score: { lte: 2 },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: { id: true, user_text: true, laoke_text: true, score_reason: true },
    })

    if (autoLints.length === 0 && failures.length === 0) {
      logger.info(
        { event: 'persona_suggestion.no_data', window_days: windowDays },
        '周分析:没新 auto_lint / failure,跳过',
      )
      return { generated: 0, rejected: 0 }
    }

    // 2. Haiku 生成建议
    const ctx: AiCallContext = {
      user_id: input.adminUserId ?? 'system',
      relationship_id: 'system',
      scene: 'profile_update', // 借用,跟画像更新 scene 同
    }

    const proposals = await haikuGenerateProposals(ctx, autoLints, failures)

    // 3. 预审 + 写入
    let generated = 0
    let rejected = 0
    for (const p of proposals) {
      const check = checkAgainstConstitution(p)
      if (!check.passed) {
        rejected++
        logger.warn(
          {
            event: 'persona_suggestion.constitution_rejected',
            field: p.field,
            violations: check.violations,
          },
          'Persona 建议被宪法预审拒绝,不写审核队列',
        )
        continue
      }

      try {
        await prisma.personaSuggestion.create({
          data: {
            field: p.field,
            action: p.action,
            content: typeof p.content === 'string' ? p.content : JSON.stringify(p.content),
            reason: p.reason,
            source_window_days: windowDays,
            source_auto_lint_ids: autoLints.map((a) => a.id),
            source_failure_ids: failures.map((f) => f.id),
            status: 'pending',
            constitution_check: { passed: true, violations: [] } as object,
          },
        })
        generated++
      } catch (e) {
        logger.warn(
          {
            event: 'persona_suggestion.write_failed',
            err: e instanceof Error ? e.message : String(e),
          },
          'Persona 建议写入失败',
        )
      }
    }

    logger.info(
      {
        event: 'persona_suggestion.done',
        generated,
        rejected,
        auto_lint_count: autoLints.length,
        failure_count: failures.length,
      },
      '周分析完成',
    )
    return { generated, rejected }
  } catch (e) {
    logger.warn(
      {
        event: 'persona_suggestion.failed',
        err: e instanceof Error ? e.message : String(e),
      },
      '周分析失败(已忽略)',
    )
    return { generated: 0, rejected: 0 }
  }
}

async function haikuGenerateProposals(
  ctx: AiCallContext,
  autoLints: Array<{ id: string; feedback_note: string | null }>,
  failures: Array<{ id: string; user_text: string; laoke_text: string; score_reason: string | null }>,
): Promise<PersonaUpdateProposal[]> {
  const systemPrompt = `你是老白人格调优员。

输入:最近 7 天的 auto_lint(老白自检出的 anti-pattern)+ failure case(用户 dislike 的回复)
任务:归纳反复出现的问题,生成 0-3 个 LaokePersona 字段更新建议。

字段:
- signature_phrases: 老白常说的话(add 新口头禅)
- forbidden_phrases: 不说的话(add 新禁词)
- recognizes: 老白能识别的模式(add)
- judgment_style: 判断风格描述(modify)
- formatting_rules: 输出格式硬规则(add)

action: 'add' | 'modify' | 'remove'

输出严格 JSON,不要 markdown 围栏:
{
  "proposals": [
    {
      "field": "...",
      "action": "...",
      "content": "..." 或 ["...", "..."],
      "reason": "..."
    }
  ]
}

要求:
- 每个 proposal 必须有具体证据(reason 引用 auto_lint pattern 或 failure case 数量)
- 不重复 / 不冲突 LaokePersona 已有内容
- 严守老白人格 5 铁律(身份/沟通/边界/诚实/兄长)— 违反会被预审拒绝

如果没有明显模式 → 返回空数组 []。`

  const userMessage = `# Auto-Lint (最近 7 天 ${autoLints.length} 条)
${autoLints.slice(0, 30).map((a, i) => `${i + 1}. ${a.feedback_note ?? '(无 note)'}`).join('\n')}

# Failure Cases (最近 7 天 ${failures.length} 条)
${failures.slice(0, 20).map((f, i) =>
  `${i + 1}. 兄弟: ${f.user_text.slice(0, 100)}\n   老白: ${f.laoke_text.slice(0, 150)}\n   原因: ${f.score_reason ?? '(无 reason)'}`,
).join('\n\n')}`

  try {
    const result = await callClaude(ctx, {
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1500,
      model: HAIKU_MODEL_ID,
      skipPersonaCheck: true,
    })
    const parsed = safeParseProposals(result.text)
    return parsed
  } catch {
    return []
  }
}

function safeParseProposals(raw: string): PersonaUpdateProposal[] {
  try {
    const trimmed = raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const obj = JSON.parse(trimmed)
    if (!obj || !Array.isArray(obj.proposals)) return []
    return obj.proposals.filter(
      (p: { field?: string; action?: string }) =>
        p.field &&
        ['signature_phrases', 'forbidden_phrases', 'recognizes', 'judgment_style', 'formatting_rules'].includes(
          p.field,
        ) &&
        ['add', 'modify', 'remove'].includes(p.action ?? ''),
    )
  } catch {
    return []
  }
}
