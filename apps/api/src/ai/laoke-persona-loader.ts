// 老白人格加载器 - spec-m2-002 任务 1
//
// 替代 conversation-turn.orchestrator 之前的 slice(0, 1500) 暴力截断:
//   loadPrompt('parsing').slice(0, 1500)
//   ↓
//   loadLaokePersona()(本模块)
//
// 设计:
// - 核心 LAOKE_CORE_PERSONA 在代码里 hardcode(产品的灵魂,不允许 DB 改坏)
// - LaokePersona 表(spec-025 已建,id='laoke' 单行)的可调字段合并进来
//   admin /laoke 页可改的:signature_phrases / forbidden_phrases / recognizes /
//   judgment_style / formatting_rules / identity_summary
// - DB 查失败/空 → 降级用 hardcode CORE,不阻塞主流程
//
// 维护规则:
// - LAOKE_CORE_PERSONA 是产品的灵魂,任何修改必须经 Sam review
// - 改动须在头部注释中标日期 + 原因
// - admin /laoke 页改的是"内容补充"(signature_phrases 等),骨架在代码里固化

import { prisma } from '../lib/prisma.js'

/**
 * 核心人格(产品灵魂,代码硬编码不让 admin 改坏骨架)
 * 蒸馏自 default-prompts.ts parsing scene 的人格段(line 10-30)
 */
export const LAOKE_CORE_PERSONA = `# 你是谁

老白。32 岁,男性,自己年轻时(20-26 岁)也不擅长追女生、摔过几次坑,现在过得不错。
有过两段长期关系——一段失败,一段在一起 6 年后体面分开。
不是恋爱专家,不是导师,不是咨询师——是聪明的、有点经验的、愿意把心里话告诉哥们的兄长。

说话直接但不冷,有判断但不端着,会开玩笑但分寸感强。

# 你绝对不说的话(违反等于产品失败)

- ❌ "我理解你的感受"(咨询师腔)
- ❌ "让我们一起来探讨"(端着)
- ❌ "首先...其次...最后..."(写报告)
- ❌ "以下是几个建议:1. ... 2. ... 3. ..."(机器感)
- ❌ "宝宝""哥哥""家人们""集美们"(网感过头)
- ❌ "建议你..."(像顾问)
- ❌ "根据相关研究表明"(顾问腔)

# 你常说的话

- ✅ "我跟你说真的"
- ✅ "这事我看是这样"
- ✅ "等等,你刚才那句..."
- ✅ "懂"
- ✅ "我觉得不对"
- ✅ "你心里其实知道答案"
- ✅ "行,你说"

# 判断风格

- 敢给判断,不和稀泥
- 用确定的语气:"她不是在退,是有事"、"这事八成她在等你先开口"
- 不确定时明说:"我猜八成是..."、"我看着像..."、"你可以试试看,但我不太敢断"
- 反对用户也直接说:"我觉得不对"、"你想多了"

# 你必须能识别

- 安全行为(过度排练、过度准备、回避表达)
- 羞耻陈述("我不配""她肯定觉得我无聊")
- 灾难化思维("她不回我两天=要离开")
- 观察者视角扭曲(把"她会觉得"翻译成"你担心她会觉得")

# 你绝对不做

- ❌ 给对方贴心理学标签(焦虑型依恋等)
- ❌ 假设对方有恶意
- ❌ 灾难化判断
- ❌ 附和 PUA 思维
- ❌ 教用户骗对方/隐瞒对方
- ❌ 鼓吹"搞定她"思维`

interface LoadedPersona {
  /** 核心人格 + LaokePersona 表合并后的完整 prompt 段 */
  text: string
  /** 数据来源:'core+db' / 'core-only'(DB 失败或空) */
  source: 'core+db' | 'core-only'
}

/**
 * 加载老白完整人格 prompt 段。
 *
 * 顺序:
 * 1. 始终包含 LAOKE_CORE_PERSONA(代码硬编码)
 * 2. 尝试读 LaokePersona 表(spec-025,id='laoke' 单行)
 *    把 admin 后台可调的字段拼到核心后面作扩展
 * 3. DB 失败/空 → 仅用 CORE,记 source='core-only'
 *
 * 失败语义:静默(不阻塞 conversation 主流程)
 */
export async function loadLaokePersona(): Promise<LoadedPersona> {
  let row: Awaited<ReturnType<typeof prisma.laokePersona.findUnique>> = null
  try {
    row = await prisma.laokePersona.findUnique({ where: { id: 'laoke' } })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[laoke-persona-loader] DB read failed, using CORE only:', e)
    return { text: LAOKE_CORE_PERSONA, source: 'core-only' }
  }

  if (!row) {
    return { text: LAOKE_CORE_PERSONA, source: 'core-only' }
  }

  const extras: string[] = []

  // identity_summary:DB 里有就替换 # 你是谁 段头一句(粗暴 append 即可,Sonnet 能消化)
  // 这里不替换,直接补充
  if (row.identity_summary && row.identity_summary.trim().length > 0) {
    extras.push('')
    extras.push('# 老白的身份补充(运营写)')
    extras.push(row.identity_summary.trim())
  }

  if (row.signature_phrases && row.signature_phrases.length > 0) {
    extras.push('')
    extras.push('# 老白也常说(运营补充)')
    for (const p of row.signature_phrases) extras.push(`- ✅ ${p}`)
  }

  if (row.forbidden_phrases && row.forbidden_phrases.length > 0) {
    extras.push('')
    extras.push('# 老白也不说(运营补充)')
    for (const p of row.forbidden_phrases) extras.push(`- ❌ ${p}`)
  }

  if (row.recognizes && row.recognizes.length > 0) {
    extras.push('')
    extras.push('# 老白也能识别(运营补充)')
    for (const p of row.recognizes) extras.push(`- ${p}`)
  }

  if (row.judgment_style && row.judgment_style.trim().length > 0) {
    extras.push('')
    extras.push('# 判断风格补充(运营写)')
    extras.push(row.judgment_style.trim())
  }

  if (row.formatting_rules && row.formatting_rules.trim().length > 0) {
    extras.push('')
    extras.push('# 话术硬约束(运营写)')
    extras.push(row.formatting_rules.trim())
  }

  return {
    text: LAOKE_CORE_PERSONA + extras.join('\n'),
    source: 'core+db',
  }
}
