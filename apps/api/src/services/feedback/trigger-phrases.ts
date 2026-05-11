// 老白关心式反馈触发话术变体(M3+ FEEDBACK SPEC)
//
// 每个 trigger 准备 3 条话术变体,客户端按 hash(user_id) % 3 定值选(同一用户稳定)
// 不同用户看到不同变体,避免社区交流时大家一样
//
// 维护规则:
// - 改话术等于改老白人格,改前看 LAOKE_CORE_PERSONA(apps/api/src/ai/laoke-persona-loader.ts)
// - 改后跑 testset(暂未有,M3 末做)
// - 不加 emoji(老白人格 forbidden)

export type FeedbackTriggerType =
  | 'ACTIVATION_SCREENSHOT'
  | 'ACTIVATION_DRAFT'
  | 'T_D2D3'
  | 'T_D5D7'
  | 'T_D12D14'
  | 'T_D30'
  | 'T_D60'
  | 'T_PERIODIC'
  | 'CRISIS_3DISLIKE'

/** 'inline' 顺口半句(跟上一条 Laoke 气泡连续)/ 'standalone' 独立气泡(带 textarea) */
export type FeedbackFormType = 'inline' | 'standalone'

export interface TriggerSpec {
  /** 提交后用户立即看到的老白预设回复(不调 LLM) */
  thanks_response: string
  form_type: FeedbackFormType
  /** 3 条话术变体,客户端按 hash(user_id) % 3 选 */
  phrases: readonly [string, string, string]
}

export const TRIGGER_SPECS: Record<FeedbackTriggerType, TriggerSpec> = {
  ACTIVATION_SCREENSHOT: {
    form_type: 'inline',
    thanks_response: '懂了,这事我记下了。',
    phrases: [
      '上次你那截图我帮你看了,我说得对路不?',
      '那张截图你看了我的复盘,觉得有用没?',
      '上次帮你看那截图,有没有看歪你告诉我。',
    ],
  },
  ACTIVATION_DRAFT: {
    form_type: 'inline',
    thanks_response: '记下了。你那边有动静再告诉我。',
    phrases: [
      '上次那句话术你发了么?发了她怎么反应?',
      '我给你的那句话,真发出去用了没?',
      '那句话术你试了没,效果咋样?',
    ],
  },
  T_D2D3: {
    form_type: 'inline',
    thanks_response: '懂了,我会改。继续聊。',
    phrases: [
      '对了,这两天用着顺手不?有不对劲直接说。',
      '诶,刚开始用我两天,有不对劲告诉我。',
      '你这两天用着咋样,有不对劲我改。',
    ],
  },
  T_D5D7: {
    form_type: 'standalone',
    thanks_response: '懂了,这事我会改。继续聊。',
    phrases: [
      '几天了,跟我聊那些事你这阵啥感觉?随便说两句给我听听。',
      '用了几天了,有没有觉得我哪句不在点子上?',
      '几天下来,有想跟我说的没?',
    ],
  },
  T_D12D14: {
    form_type: 'standalone',
    thanks_response: '懂了,这事我会改。继续聊。',
    phrases: [
      '两周了。回看一下 — 我帮你的那些事里,真用上的有没?',
      '用我两周,觉得跟一开始想的一样不一样?',
      '两周下来,你跟她有啥变化没?跟我说说。',
    ],
  },
  T_D30: {
    form_type: 'standalone',
    thanks_response: '懂了,这事我会改。继续聊。',
    phrases: [
      '看着这一个月的对话,你跟她的事,我帮上忙了么?哪儿没帮到位你也说。',
      '一个月了,实话说,你用我有变化没?',
      '这一个月你跟我聊了不少。回头看你想我帮你啥?',
    ],
  },
  T_D60: {
    form_type: 'inline',
    thanks_response: '懂了,我会留心。',
    phrases: [
      '诶,刚想起来问,你最近用我帮你聊的事,顺不顺?',
      '突然想起来 — 我们俩这阵处得咋样,你说说。',
      '用了俩月了,你看我有啥得改的没?',
    ],
  },
  T_PERIODIC: {
    form_type: 'inline',
    thanks_response: '懂了,我会留心。',
    phrases: [
      '诶,刚想起来问,你最近用我帮你聊的事,顺不顺?',
      '突然想起来 — 我们俩这阵处得咋样,你说说。',
      '用了这么久了,你看我有啥得改的没?',
    ],
  },
  CRISIS_3DISLIKE: {
    form_type: 'standalone',
    thanks_response: '懂了,下次注意。',
    phrases: [
      '我看你最近几次回得都不顺。不绕弯,你直接告诉我哪不对头,我下次注意。',
      "这几次你都点了'不行',我自己也得改。你说说哪儿不对路。",
      '我看你这阵给我反馈说不行的多。你帮我想想,我哪儿没在点上?',
    ],
  },
}

/** 按 hash(user_id) % 3 在变体里定值选(同一用户每次同一 trigger 看到的稳定) */
export function pickPhrase(triggerType: FeedbackTriggerType, userId: string): string {
  const spec = TRIGGER_SPECS[triggerType]
  // 简易 hash:userId 字符 charCode 求和(不需要密码学强度,稳定即可)
  let sum = 0
  for (let i = 0; i < userId.length; i++) sum += userId.charCodeAt(i)
  const idx = sum % spec.phrases.length
  return spec.phrases[idx]!
}
