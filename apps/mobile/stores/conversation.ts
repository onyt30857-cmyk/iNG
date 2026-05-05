// 关系对话流 store - Phase 1 重构核心
//
// 设计:每段关系一个持续聊天流,messages 时间线无穷累积
// session 状态机退到后端,前端只渲染"老 K 输出 → 消息"
//
// M1 mock:写死一段完整对话(从 3 天前的复盘到今天)给 Sam 看产品形态
// 后端联调后:这里改成"用户发新消息 → 后端创建 session → 状态机走完 → 流式推消息回来"

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Message, ReplyDraft, PlanningContent } from '../types/message'

// === localStorage 持久化(spec-006 §3.2)===
// 每段关系 messages 数组单独存一个 key。uni.setStorageSync H5 模式底层用 localStorage。
// blob URL(uni.chooseImage tempFilePath)刷新即失效,持久化时丢弃 user_screenshots.urls,
// 只留 count + 占位。后续 spec-004 接 OSS 后改存 OSS URL。
const STORAGE_KEY = (relId: string) => `lianai:conversation:${relId}`

function loadFromStorage(relationshipId: string): Message[] | null {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY(relationshipId))
    if (raw && typeof raw === 'string' && raw.length > 0) {
      const parsed = JSON.parse(raw) as Message[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[conversation] localStorage load failed', e)
  }
  return null
}

function saveToStorage(relationshipId: string, messages: Message[]): void {
  try {
    // 清掉 blob URL(刷新会失效),保留 count
    const sanitized: Message[] = messages.map((m) => {
      if (m.type === 'user_screenshots' && m.urls.some((u) => u.startsWith('blob:'))) {
        return { ...m, urls: [] }
      }
      return m
    })
    uni.setStorageSync(STORAGE_KEY(relationshipId), JSON.stringify(sanitized))
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[conversation] localStorage save failed', e)
  }
}

// ============== Mock 一段林涛 persona 的真实对话 ==============
// 3 天前完整复盘 → 昨天追问 → 今天空白(等用户发新)

function mockMessagesForXiaoyu(): Message[] {
  const threeDaysAgo = new Date(Date.now() - 3 * 86400_000)
  const yesterday = new Date(Date.now() - 1 * 86400_000)
  const today = new Date()

  const drafts: ReplyDraft[] = [
    {
      id: 'd1',
      direction: '方向 1 · 轻巧化解',
      text: '你这两天忙啊,我刚看到那家店开了新店,等你哪天有空一起去',
      what_it_does: '避开了"为什么不回"的追问',
      good_for: '她确实只是累,不是冷',
      trade_off: '这段对话的张力会被你软化',
    },
    {
      id: 'd2',
      direction: '方向 2 · 换个话题',
      text: '今天看到一篇文章想到你,链接发你了,不急看',
      what_it_does: '用一个具体的小礼物代替追问',
      good_for: '你想保持联系但不想问"怎么了"',
      trade_off: '她可能根本不点开',
    },
    {
      id: 'd3',
      direction: '方向 3 · 温柔正面',
      text: '我感觉你最近有点累。要是想说,我在;不想说,我也在',
      what_it_does: '把空间还给她,但表态在',
      good_for: '她真的有事且需要被看到',
      trade_off: '她可能觉得太重了',
    },
  ]

  return [
    // ============= 3 天前 =============
    { id: 'div-1', type: 'system_divider', label: '3 天前', created_at: threeDaysAgo.toISOString() },
    {
      id: 'm-1',
      type: 'user_screenshots',
      urls: [], // mock 历史消息无真图,气泡 fallback 走老占位条
      count: 5,
      created_at: new Date(threeDaysAgo.getTime() + 1000).toISOString(),
    },
    {
      id: 'm-2',
      type: 'laoke_text',
      text: `我看了下你和小雨这段。从 4 月 12 号到昨晚,大概一周时间,你发了 14 条,她回了 8 条。

几个事:
· 她最后一条「先这样吧」是昨晚 9 点 47
· 之前一周她平均 30 分钟内回,昨晚那条她过了 4 小时才回
· 你在最后回得最多——一晚上发了 4 条,她次日才一起回`,
      created_at: new Date(threeDaysAgo.getTime() + 5000).toISOString(),
    },
    {
      id: 'm-3',
      type: 'laoke_question',
      text: '看完这段你最在意她哪一句?为什么是那一句?',
      sequence: 1,
      total: 3,
      created_at: new Date(threeDaysAgo.getTime() + 30_000).toISOString(),
    },
    {
      id: 'm-4',
      type: 'user_text',
      text: '最后那句「先这样吧」。我反复看了好几遍,感觉她语气和之前不太一样。',
      created_at: new Date(threeDaysAgo.getTime() + 90_000).toISOString(),
    },
    {
      id: 'm-5',
      type: 'laoke_question',
      text: '那你当时第一反应是想发点什么?(写出来,哪怕是没发出去的话)',
      sequence: 2,
      total: 3,
      created_at: new Date(threeDaysAgo.getTime() + 100_000).toISOString(),
    },
    {
      id: 'm-6',
      type: 'user_text',
      text: '想问"是不是我说错什么了"。但我没发出去,我知道这样会让她更烦。',
      created_at: new Date(threeDaysAgo.getTime() + 180_000).toISOString(),
    },
    {
      id: 'm-7',
      type: 'laoke_question',
      text: '你心里其实希望她那句话是什么意思?',
      sequence: 3,
      total: 3,
      created_at: new Date(threeDaysAgo.getTime() + 200_000).toISOString(),
    },
    {
      id: 'm-8',
      type: 'user_text',
      text: '希望她只是真的累了,不是对我冷了。',
      created_at: new Date(threeDaysAgo.getTime() + 280_000).toISOString(),
    },
    {
      id: 'm-9',
      type: 'laoke_diagnosing',
      paragraphs: [
        { text: '这段我看下来,你心里其实知道答案了,但你想从我这里再确认一次。' },
        {
          text: '你说"我不该一晚上发四条"——这话不是事实,是羞耻。\n你发四条不是因为没分寸,是那一刻你需要她回你一句。这俩不是一回事。',
          is_shame_handling: true,
        },
        { text: '她那句"先这样吧"我看着像两件事:一是真的累了,二是她不想现在解释。两个原因都不冲。' },
        { text: '你在意的不是她回得慢,是你不知道这段有没有问题。\n我跟你说:有一点小问题,但还没到坏的地步。' },
      ],
      created_at: new Date(threeDaysAgo.getTime() + 320_000).toISOString(),
    },
    {
      id: 'm-10',
      type: 'laoke_planning',
      content: {
        title: '今晚什么都别发',
        what_to_do: '今晚把手机放下,做点别的。',
        why: '她现在需要的不是你的一条新消息,是空间。',
        red_line: '今晚不发,明天不发,后天前不发。',
        fallback: '做不到 48 小时也行,但你得知道那是焦虑在催。',
      },
      created_at: new Date(threeDaysAgo.getTime() + 380_000).toISOString(),
    },
    {
      id: 'm-11',
      type: 'laoke_drafts',
      intro: '给你三个方向,你看哪个像你。',
      drafts,
      created_at: new Date(threeDaysAgo.getTime() + 420_000).toISOString(),
    },
    {
      id: 'm-12',
      type: 'user_action',
      text: '选了方向 1 · 轻巧化解',
      action_type: 'select_reply',
      created_at: new Date(threeDaysAgo.getTime() + 600_000).toISOString(),
    },

    // ============= 昨天 =============
    { id: 'div-2', type: 'system_divider', label: '昨天', created_at: yesterday.toISOString() },
    {
      id: 'm-13',
      type: 'user_text',
      text: '她回我了说 "好啊,等我下周三忙完",感觉比之前好。',
      created_at: new Date(yesterday.getTime() + 50_000_000).toISOString(),
    },
    {
      id: 'm-14',
      type: 'laoke_text',
      text: '那就稳了。她有时间锚点,说明不是在敷衍。\n下周三之前你别催,等她。等她那天前一天再发"还约不?"——给她出口。',
      created_at: new Date(yesterday.getTime() + 50_010_000).toISOString(),
    },

    // ============= 今天 =============
    { id: 'div-3', type: 'system_divider', label: '今天', created_at: today.toISOString() },
  ]
}

function mockMessagesForXiaomei(): Message[] {
  return [
    {
      id: 'sm-1',
      type: 'laoke_text',
      text: '行,你跟我说说她。\n最近一次跟她聊,是啥情况?',
      created_at: new Date().toISOString(),
    },
  ]
}

function mockMessagesForLingling(): Message[] {
  return [
    {
      id: 'sm-1',
      type: 'laoke_text',
      text: '行,你跟我说说她。\n最近一次跟她聊,是啥情况?',
      created_at: new Date().toISOString(),
    },
  ]
}

const MOCK_BY_RELATIONSHIP: Record<string, Message[]> = {
  'mock-1': mockMessagesForXiaoyu(),
  'mock-2': mockMessagesForXiaomei(),
  'mock-3': mockMessagesForLingling(),
}

// ============== Store ==============

export const useConversationStore = defineStore('conversation', () => {
  // 当前 relationship 对话流(每个 relationship 一组 messages)
  const messagesByRelationship = ref<Record<string, Message[]>>({})

  // 收藏的话术 + 方向(三件套之"用户手动收藏")
  const savedDrafts = ref<Record<string, ReplyDraft[]>>({})        // relationshipId → drafts
  const savedPlannings = ref<Record<string, Array<{ id: string; content: PlanningContent; saved_at: string }>>>({})

  function isFreshConversation(relationshipId: string): boolean {
    const list = messagesByRelationship.value[relationshipId]
    if (!list) return true
    // 只有 1 条老 K 开场白 = 新对话
    return list.length <= 1
  }

  function saveDraft(relationshipId: string, draft: ReplyDraft) {
    const cur = savedDrafts.value[relationshipId] ?? []
    if (cur.find((d) => d.id === draft.id)) return  // 已收藏
    savedDrafts.value[relationshipId] = [...cur, draft]
    uni.showToast({ title: '记下了', icon: 'none', duration: 1200 })
  }

  function unsaveDraft(relationshipId: string, draftId: string) {
    const cur = savedDrafts.value[relationshipId] ?? []
    savedDrafts.value[relationshipId] = cur.filter((d) => d.id !== draftId)
  }

  function isDraftSaved(relationshipId: string, draftId: string): boolean {
    return !!savedDrafts.value[relationshipId]?.find((d) => d.id === draftId)
  }

  function getSavedDrafts(relationshipId: string): ReplyDraft[] {
    return savedDrafts.value[relationshipId] ?? []
  }

  function savePlanning(relationshipId: string, id: string, content: PlanningContent) {
    const cur = savedPlannings.value[relationshipId] ?? []
    if (cur.find((p) => p.id === id)) return
    savedPlannings.value[relationshipId] = [
      ...cur,
      { id, content, saved_at: new Date().toISOString() },
    ]
    uni.showToast({ title: '记下了', icon: 'none', duration: 1200 })
  }

  function isPlanningSaved(relationshipId: string, id: string): boolean {
    return !!savedPlannings.value[relationshipId]?.find((p) => p.id === id)
  }

  function getSavedPlannings(relationshipId: string) {
    return savedPlannings.value[relationshipId] ?? []
  }

  function loadConversation(relationshipId: string) {
    if (messagesByRelationship.value[relationshipId]) return

    // 1. 优先 localStorage(用户上次留下的真实历史)
    const persisted = loadFromStorage(relationshipId)
    if (persisted && persisted.length > 0) {
      messagesByRelationship.value[relationshipId] = persisted
      return
    }

    // 2. 没存过 → mock 数据(开发体验) / 新关系开场白
    const mock = MOCK_BY_RELATIONSHIP[relationshipId]
    if (mock) {
      messagesByRelationship.value[relationshipId] = mock
    } else {
      messagesByRelationship.value[relationshipId] = [
        {
          id: 'fresh-1',
          type: 'laoke_text',
          text: '行,你跟我说说她。\n最近一次跟她聊,是啥情况?',
          created_at: new Date().toISOString(),
        },
      ]
    }
  }

  function getMessages(relationshipId: string): Message[] {
    return messagesByRelationship.value[relationshipId] ?? []
  }

  // 拿某关系最新一条消息(主页关系卡显示用)
  function latestMessage(relationshipId: string): Message | null {
    const list = messagesByRelationship.value[relationshipId]
    if (!list || list.length === 0) return null
    // 找最近一条非 system_divider 的
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!
      if (m.type !== 'system_divider') return m
    }
    return null
  }

  // 简短文本预览(主页关系卡 1 行)
  function latestPreview(relationshipId: string): { text: string; from: 'laoke' | 'user' | null } {
    const m = latestMessage(relationshipId)
    if (!m) return { text: '', from: null }
    switch (m.type) {
      case 'laoke_text':
        return { text: m.text.split('\n')[0]!, from: 'laoke' }
      case 'laoke_question':
        return { text: m.text, from: 'laoke' }
      case 'laoke_diagnosing':
        return { text: m.paragraphs[0]?.text.split('\n')[0] ?? '', from: 'laoke' }
      case 'laoke_planning':
        return { text: m.content.title, from: 'laoke' }
      case 'laoke_drafts':
        return { text: m.intro, from: 'laoke' }
      case 'user_text':
        return { text: m.text, from: 'user' }
      case 'user_screenshots':
        return { text: `发了 ${m.count} 张截图`, from: 'user' }
      case 'user_action':
        return { text: m.text, from: 'user' }
      default:
        return { text: '', from: null }
    }
  }

  function latestTime(relationshipId: string): string | null {
    const m = latestMessage(relationshipId)
    return m?.created_at ?? null
  }

  // === 用户发新消息(spec-006 Phase 18.2:真 LLM turn,删除 mock 占位)===
  // silent=true:不触发 turn(OCR 流程调用方自己接管 PARSING 流式)
  function appendUserText(
    relationshipId: string,
    text: string,
    opts: { silent?: boolean } = {},
  ) {
    const list = messagesByRelationship.value[relationshipId] ?? []
    list.push({
      id: `u-${Date.now()}`,
      type: 'user_text',
      text,
      created_at: new Date().toISOString(),
    })
    messagesByRelationship.value[relationshipId] = [...list]

    if (opts.silent) return

    // 真 LLM turn:用户发字 → 老 K 流式回应。失败时显示具体错误,不再 mock 占位
    void triggerLaokeTurn(relationshipId, text)
  }

  /** spec-006 Phase 18.2:用户发字后,异步调 conversation turn 端点拿老 K 流式回应 */
  async function triggerLaokeTurn(relationshipId: string, userText: string): Promise<void> {
    // 先 push 一条 streaming laoke 气泡占位
    const streamingId = appendStreamingLaokeText(relationshipId)
    updateStreamingLaokeText(relationshipId, streamingId, '')

    // 收集 conversation 历史(只取 user_text 和 laoke_text,其它类型 turn 不需要)
    const all = messagesByRelationship.value[relationshipId] ?? []
    const history: Array<{ speaker: 'user' | 'laoke'; text: string }> = []
    for (const m of all) {
      if (m.type === 'user_text') {
        history.push({ speaker: 'user', text: m.text })
      } else if (m.type === 'laoke_text' && !m.is_thinking) {
        history.push({ speaker: 'laoke', text: m.text })
      }
    }
    // 去掉刚 append 的"用户最新一条"(避免重复进 user_text 字段)
    const userMsgIndex = history.findIndex((h) => h.speaker === 'user' && h.text === userText)
    if (userMsgIndex >= 0) history.splice(userMsgIndex, 1)

    let fullText = ''
    try {
      // 动态 import 避免 store 顶层 import api(顶层循环依赖风险)
      const { streamConversationTurnHTTP } = await import('../api/replay.api')
      const { DEV_RELATIONSHIP_ID } = await import('../utils/dev-token')

      // spec-007 Phase 19.5:把当前关系的 signal 翻译成老 K 视角 brief 塞进请求,
      // 当 LLM 的 inner state(他"私下看到的")。数据不足时 brief 为 null,后端会跳过。
      const { useRelationshipSignalsStore } = await import('./relationship-signals')
      const { buildSignalBrief } = await import('../utils/signal-to-brief')
      const signalsStore = useRelationshipSignalsStore()
      const signalBrief = buildSignalBrief(signalsStore.getSignal(relationshipId))

      // dev 阶段强制用 DEV_RELATIONSHIP_ID(db 里只有这一段真关系,见 Phase 14b 修复)
      await streamConversationTurnHTTP(
        DEV_RELATIONSHIP_ID,
        { user_text: userText, history, signal_brief: signalBrief },
        (chunk) => {
          fullText += chunk
          updateStreamingLaokeText(relationshipId, streamingId, fullText)
        },
      )
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[turn] 失败:', e)
      const errMsg = e instanceof Error ? e.message : String(e)
      updateStreamingLaokeText(
        relationshipId,
        streamingId,
        fullText
          ? `${fullText}\n\n[出错了:${errMsg}]`
          : `我这边出了点意外:${errMsg}`,
      )
    }
    finishStreamingLaokeText(relationshipId, streamingId)
  }

  /**
   * 加一条流式 laoke_text 气泡(初始空文本,is_thinking=true),返回 messageId。
   * 配合 updateStreamingLaokeText 实时 append SSE chunks,finishStreamingLaokeText 标记完成。
   */
  function appendStreamingLaokeText(relationshipId: string): string {
    const id = `k-stream-${Date.now()}`
    const list = messagesByRelationship.value[relationshipId] ?? []
    list.push({
      id,
      type: 'laoke_text',
      text: '',
      is_thinking: true,
      created_at: new Date().toISOString(),
    })
    messagesByRelationship.value[relationshipId] = [...list]
    return id
  }

  function updateStreamingLaokeText(
    relationshipId: string,
    messageId: string,
    text: string,
  ) {
    const list = messagesByRelationship.value[relationshipId] ?? []
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx === -1) return
    const m = list[idx]
    if (!m || m.type !== 'laoke_text') return
    list[idx] = { ...m, text, is_thinking: true }
    messagesByRelationship.value[relationshipId] = [...list]
  }

  function finishStreamingLaokeText(relationshipId: string, messageId: string) {
    const list = messagesByRelationship.value[relationshipId] ?? []
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx === -1) return
    const m = list[idx]
    if (!m || m.type !== 'laoke_text') return
    list[idx] = { ...m, is_thinking: false }
    messagesByRelationship.value[relationshipId] = [...list]
  }

  // === localStorage 持久化:监听 messagesByRelationship 变化,debounce 500ms 写入 ===
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    messagesByRelationship,
    (next) => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        for (const [relId, msgs] of Object.entries(next)) {
          if (Array.isArray(msgs)) saveToStorage(relId, msgs)
        }
      }, 500)
    },
    { deep: true },
  )

  // silent=true:跳过 mock 老 K 自动回复(真 OCR 流程调用方自己接管 PARSING 流式)
  // urls:用户上传的真实图片 URL 列表。气泡用它做缩略图 + uni.previewImage 点击放大
  function appendUserScreenshots(
    relationshipId: string,
    urls: string[],
    opts: { silent?: boolean } = {},
  ) {
    const list = messagesByRelationship.value[relationshipId] ?? []
    list.push({
      id: `us-${Date.now()}`,
      type: 'user_screenshots',
      urls,
      count: urls.length,
      created_at: new Date().toISOString(),
    })
    messagesByRelationship.value[relationshipId] = [...list]

    if (opts.silent) return

    // mock 老 K 看截图反馈(用户随手发截图时占位,OCR 真接入后调用方传 silent=true 跳过)
    setTimeout(() => {
      const cur = messagesByRelationship.value[relationshipId] ?? []
      cur.push({
        id: `kt-${Date.now()}`,
        type: 'laoke_text',
        text: '正在看你的截图...',
        is_thinking: true,
        created_at: new Date().toISOString(),
      })
      messagesByRelationship.value[relationshipId] = [...cur]
    }, 500)

    setTimeout(() => {
      const cur = messagesByRelationship.value[relationshipId] ?? []
      const idx = cur.findIndex((m) => m.type === 'laoke_text' && m.is_thinking)
      if (idx >= 0) {
        cur[idx] = {
          id: `k-${Date.now()}`,
          type: 'laoke_text',
          text: '(M1 mock — 等真接 OCR 后这里就是基于截图内容的真实分析)',
          created_at: new Date().toISOString(),
        }
      }
      messagesByRelationship.value[relationshipId] = [...cur]
    }, 3500)
  }

  return {
    messagesByRelationship,
    loadConversation,
    getMessages,
    latestMessage,
    latestPreview,
    latestTime,
    appendUserText,
    appendUserScreenshots,
    appendStreamingLaokeText,
    updateStreamingLaokeText,
    finishStreamingLaokeText,
    isFreshConversation,
    saveDraft,
    unsaveDraft,
    isDraftSaved,
    getSavedDrafts,
    savePlanning,
    isPlanningSaved,
    getSavedPlannings,
  }
})
