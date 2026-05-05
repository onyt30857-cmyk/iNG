// 复盘 Pinia store - spec-005
//
// 当前阶段:用 mock 数据驱动状态机,setTimeout 模拟 LLM 流式完成。
// 后续阶段(Sam 配 Anthropic API key 后):
//   - 把 mock 替换为 SSE 流式接收
//   - transition 调用后端 /v1/sessions/:id/transition
//
// 设计:store 内部维护 ReplayState,各 view 组件通过 store 读取自己需要的数据。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ReplayState,
  ParsingOutput,
  ReflectingMessage,
  DiagnosingOutput,
  PlanningDirection,
  ReplyDraft,
} from '../types/replay'
import {
  runParsing,
  streamParsingHTTP,
  runReflecting,
  runDiagnosing,
  streamDiagnosingHTTP,
  runPlanning,
  streamPlanningHTTP,
  runDrafting,
  type ParsingMessage,
} from '../api/replay.api'
import { DEV_SESSION_ID } from '../utils/dev-token'
import { parsePlanningText } from '../utils/parse-planning'

// dev 默认 messages — 直接进 mock 复盘流程时用
// spec-004 OCR 实施后,用户上传真截图,activeMessages 被覆盖
const DEV_DEFAULT_PARSING_MESSAGES: ParsingMessage[] = [
  { speaker: 'user', text: '在干嘛', timestamp: '周一 19:30' },
  { speaker: 'other', text: '刚下班,有点累', timestamp: '周一 20:14' },
  { speaker: 'user', text: '那你早点睡,我看到那家店开了新店', timestamp: '周一 20:17' },
  { speaker: 'other', text: '嗯', timestamp: '周一 22:03' },
  { speaker: 'user', text: '你周末去那边附近吗', timestamp: '周二 12:08' },
  { speaker: 'other', text: '看吧', timestamp: '周二 14:21' },
  { speaker: 'user', text: '那我先订?', timestamp: '周二 14:23' },
  { speaker: 'other', text: '你订吧', timestamp: '周二 18:05' },
  { speaker: 'user', text: '周末一起?', timestamp: '周二 22:12' },
  { speaker: 'other', text: '先这样吧', timestamp: '周二 22:47' },
]
const DEV_PARSING_ENTRY_NOTE = '她两天没回我了'

// dev 阶段:用户对 PARSING 反向确认问的回答(模拟用户输入)
// spec-005 §3.x 加真用户输入流程后,这个字段从前端 input box 拿
const DEV_USER_INITIAL_RESPONSE = '感觉她不喜欢我了'

const DEV_SCENARIO_PRIMARY = 'FLIRT_008'

// ============== Mock 数据(从复盘原型 HTML 同步) ==============

const MOCK_PARSING: ParsingOutput = {
  summary: `我看了下你和小雨这段。从 4 月 12 号到昨晚,大概一周时间,你发了 14 条,她回了 8 条。

几个事:
· 她最后一条「先这样吧」是昨晚 9 点 47
· 之前一周她平均 30 分钟内回,昨晚那条她过了 4 小时才回
· 你在最后回得最多——一晚上发了 4 条,她次日才一起回`,
  events: [],
}

const MOCK_REFLECTING_QUESTIONS = [
  '看完这段你最在意她哪一句?为什么是那一句?',
  '你当时第一反应是想发点什么?(写出来,哪怕是没发出去的话)',
  '你心里其实希望她那句话是什么意思?',
]

const MOCK_DIAGNOSING: DiagnosingOutput = {
  paragraphs: [
    { text: '这段我看下来,你心里其实知道答案了,但你想从我这里再确认一次。' },
    {
      text: '你说"我不该一晚上发四条"——这话不是事实,是羞耻。\n你发四条不是因为没分寸,是那一刻你需要她回你一句。\n这俩不是一回事。',
      is_shame_handling: true,
    },
    { text: '她那句"先这样吧"我看着像两件事:一是真的累了,二是她不想现在解释。两个原因都不冲。' },
    { text: '你在意的不是她回得慢,是你不知道这段有没有问题。\n我跟你说:有一点小问题,但还没到坏的地步。' },
  ],
  crisis_detected: false,
}

const MOCK_PLANNING: PlanningDirection = {
  title: '今晚什么都别发',
  what_to_do: '今晚把手机放下,做点别的。',
  why: '她现在需要的不是你的一条新消息,是空间。',
  red_line: '今晚不发,明天不发,后天前不发。',
  fallback: '做不到 48 小时也行,但你得知道那是焦虑在催。',
}

const MOCK_DRAFTING: ReplyDraft[] = [
  {
    id: 'reply-1',
    direction: '方向 1 · 轻巧化解',
    text: '你这两天忙啊,我刚看到那家店开了新店,等你哪天有空一起去',
    what_it_does: '避开了"为什么不回"的追问',
    good_for: '她确实只是累,不是冷',
    trade_off: '这段对话的张力会被你软化',
  },
  {
    id: 'reply-2',
    direction: '方向 2 · 换个话题',
    text: '今天看到一篇文章想到你,链接发你了,不急看',
    what_it_does: '用一个具体的小礼物代替追问',
    good_for: '你想保持联系但不想问"怎么了"',
    trade_off: '她可能根本不点开',
  },
  {
    id: 'reply-3',
    direction: '方向 3 · 温柔正面',
    text: '我感觉你最近有点累。要是想说,我在;不想说,我也在',
    what_it_does: '把空间还给她,但表态在',
    good_for: '她真的有事且需要被看到',
    trade_off: '她可能觉得太重了',
  },
]

// ============== Store ==============

export const useReplayStore = defineStore('replay', () => {
  const state = ref<ReplayState>('ENTRY')
  const sessionId = ref('mock-session-1')
  const relationshipName = ref('小雨')
  const relationshipStage = ref('暧昧期')

  // Parsing
  const parsingText = ref('')
  const parsingDone = ref(false)
  const isParsingTyping = ref(false)

  // Reflecting
  const reflectingMessages = ref<ReflectingMessage[]>([])
  const reflectingQuestionIndex = ref(0)
  const reflectingAnswers = ref<string[]>([])
  /** 当前 session 的 3 个引导问题:真 API 时被填,失败回退到 MOCK_REFLECTING_QUESTIONS */
  const reflectingQuestions = ref<string[]>([])

  // Diagnosing
  const diagnosingOutput = ref<DiagnosingOutput | null>(null)
  const isDiagnosingTyping = ref(false)
  /** SSE 流式过程中实时累加的文本(streaming 期间 view 优先展示这个) */
  const diagnosingStreamingText = ref('')

  // Planning
  const planning = ref<PlanningDirection | null>(null)
  /** SSE 流式过程中实时累加的文本(streaming 期间 view 优先展示这个) */
  const planningStreamingText = ref('')

  // Drafting
  const drafting = ref<ReplyDraft[]>([])
  const selectedReplyId = ref<string | null>(null)

  // Closed
  const closingMessage = ref('')

  // 当前复盘的对话消息(默认 hardcoded,被 OCR 上传后覆盖)
  const activeMessages = ref<ParsingMessage[]>([...DEV_DEFAULT_PARSING_MESSAGES])
  const activeEntryNote = ref<string>(DEV_PARSING_ENTRY_NOTE)

  const isFinal = computed(() => state.value === 'CLOSED')

  // ============== 主流程触发(从 entry 抽屉提交后调) ==============
  function startMockReplay() {
    reset()
    activeMessages.value = [...DEV_DEFAULT_PARSING_MESSAGES]
    activeEntryNote.value = DEV_PARSING_ENTRY_NOTE
    state.value = 'PARSING'
    streamParsing()
  }

  /** OCR 拿到真消息后启动复盘(spec-004 真用户上传截图入口) */
  function startReplayWithMessages(messages: ParsingMessage[], entryNote: string) {
    reset()
    activeMessages.value = messages
    activeEntryNote.value = entryNote || '(没填备注)'
    state.value = 'PARSING'
    streamParsing()
  }

  function reset() {
    state.value = 'ENTRY'
    parsingText.value = ''
    parsingDone.value = false
    reflectingMessages.value = []
    reflectingQuestionIndex.value = 0
    reflectingAnswers.value = []
    reflectingQuestions.value = []
    diagnosingOutput.value = null
    diagnosingStreamingText.value = ''
    planning.value = null
    planningStreamingText.value = ''
    drafting.value = []
    selectedReplyId.value = null
    closingMessage.value = ''
  }

  // ============== PARSING(真流式 SSE,每个 chunk 直接 append) ==============
  // 后端用 chunked transfer-encoding 推 text deltas,前端 fetch + ReadableStream 实时 append
  // 到 parsingText。体感"老 K 边想边说",而不是等待 5-9s 后突然出现完整文字。
  // 流式失败 → 回退到同步 runParsing → 再失败回退 mock。
  async function streamParsing() {
    isParsingTyping.value = true
    parsingText.value = ''
    let useFallback = true

    // 1. 优先尝试 SSE 流式
    try {
      const startTime = Date.now()
      await streamParsingHTTP(
        DEV_SESSION_ID,
        {
          messages: activeMessages.value,
          entry_note: activeEntryNote.value,
        },
        (chunk) => {
          parsingText.value += chunk
        },
      )
      useFallback = false
      // eslint-disable-next-line no-console
      console.info(`[PARSING-stream] ${Date.now() - startTime}ms 完成`)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[PARSING-stream] 流式失败,降级同步 API:', e)
      parsingText.value = '' // 清空可能已经写入的部分文本
    }

    // 2. 流式失败 → 同步 runParsing(失败再回退 mock)+ 打字机展示
    if (useFallback) {
      let target = MOCK_PARSING.summary
      try {
        const r = await runParsing(DEV_SESSION_ID, {
          messages: activeMessages.value,
          entry_note: activeEntryNote.value,
        })
        if (r.ok) {
          target = r.data.text
          // eslint-disable-next-line no-console
          console.info(
            `[PARSING] ${r.data.duration_ms}ms · ${r.data.usage.input_tokens}/${r.data.usage.output_tokens} tokens · persona=${r.data.persona_passed ? '✓' : '✗'}`,
          )
        }
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.warn('[PARSING] 同步 API 也失败,回退 mock:', e2)
      }

      // 打字机展示(同步 API 路径)
      await new Promise<void>((resolve) => {
        let i = 0
        const speed = 28
        const tick = () => {
          if (i >= target.length) {
            resolve()
            return
          }
          parsingText.value = target.slice(0, i + 1)
          i += 1
          setTimeout(tick, speed)
        }
        tick()
      })
    }

    isParsingTyping.value = false
    parsingDone.value = true
    setTimeout(() => transitionToReflecting(), 800)
  }

  // ============== REFLECTING 转入(真调 + mock 回退) ==============
  async function transitionToReflecting() {
    state.value = 'REFLECTING'

    // 真 API:用 PARSING 阶段拿到的 parsingText(可能是真 Claude 文本,可能是 mock)
    let questions: string[] = [...MOCK_REFLECTING_QUESTIONS]
    try {
      const r = await runReflecting(DEV_SESSION_ID, {
        messages: activeMessages.value,
        parsing_output: parsingText.value,
        user_initial_response: DEV_USER_INITIAL_RESPONSE,
        scenario_primary: DEV_SCENARIO_PRIMARY,
      })
      if (r.ok) {
        questions = r.data.questions.map((q) => q.text)
        // eslint-disable-next-line no-console
        console.info(
          `[REFLECTING] ${r.data.duration_ms}ms · ${r.data.usage.input_tokens}/${r.data.usage.output_tokens} tokens · persona=${r.data.persona_passed ? '✓' : '✗'}`,
        )
      } else {
        // eslint-disable-next-line no-console
        console.warn('[REFLECTING] 真 API 失败,回退 mock:', r.error)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[REFLECTING] 真 API 异常,回退 mock:', e)
    }

    reflectingQuestions.value = questions
    if (questions[0]) pushLaokeMessage(questions[0])
  }

  // ============== REFLECTING(用户答题) ==============
  function pushLaokeMessage(text: string) {
    reflectingMessages.value = [
      ...reflectingMessages.value,
      { speaker: 'laoke', text },
    ]
  }

  function pushUserMessage(text: string) {
    reflectingMessages.value = [
      ...reflectingMessages.value,
      { speaker: 'user', text },
    ]
  }

  function submitReflectingAnswer(text: string) {
    pushUserMessage(text)
    reflectingAnswers.value = [...reflectingAnswers.value, text]

    const total = reflectingQuestions.value.length || MOCK_REFLECTING_QUESTIONS.length
    const next = reflectingQuestionIndex.value + 1
    if (next < total) {
      reflectingQuestionIndex.value = next
      const nextQ =
        reflectingQuestions.value[next] ?? MOCK_REFLECTING_QUESTIONS[next]
      // 老 K 等用户喘口气再问
      setTimeout(() => {
        if (nextQ) pushLaokeMessage(nextQ)
      }, 600)
    } else {
      // 答完三题 → DIAGNOSING
      setTimeout(() => transitionToDiagnosing(), 800)
    }
  }

  // ============== DIAGNOSING 转入(SSE 流式 → 完成后切 paragraphs) ==============
  async function transitionToDiagnosing() {
    state.value = 'DIAGNOSING'
    isDiagnosingTyping.value = true
    diagnosingStreamingText.value = ''

    const reflections = reflectingAnswers.value.map((answer, i) => ({
      question:
        reflectingQuestions.value[i] ?? MOCK_REFLECTING_QUESTIONS[i] ?? '',
      answer,
    }))

    let fullText = ''
    let useFallback = true
    try {
      const startTime = Date.now()
      await streamDiagnosingHTTP(
        DEV_SESSION_ID,
        {
          messages: activeMessages.value,
          parsing_output: parsingText.value,
          reflections,
          scenario_primary: DEV_SCENARIO_PRIMARY,
        },
        (chunk) => {
          diagnosingStreamingText.value += chunk
          fullText += chunk
        },
      )
      useFallback = false
      // eslint-disable-next-line no-console
      console.info(`[DIAGNOSING-stream] ${Date.now() - startTime}ms 完成`)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DIAGNOSING-stream] 流式失败,降级同步:', e)
      diagnosingStreamingText.value = ''
      fullText = ''
    }

    let output: DiagnosingOutput = MOCK_DIAGNOSING
    if (!useFallback && fullText) {
      // 流式成功 → 切 paragraphs
      const paragraphs = fullText
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text) => ({ text, is_shame_handling: false }))
      output = { paragraphs, crisis_detected: false }
    } else {
      // 流式失败 → 同步 API 兜底
      try {
        const r = await runDiagnosing(DEV_SESSION_ID, {
          messages: activeMessages.value,
          parsing_output: parsingText.value,
          reflections,
          scenario_primary: DEV_SCENARIO_PRIMARY,
        })
        if (r.ok) {
          const paragraphs = r.data.text
            .split(/\n\s*\n/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((text) => ({ text, is_shame_handling: false }))
          output = { paragraphs, crisis_detected: false }
        }
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.warn('[DIAGNOSING] 同步也失败,回退 mock:', e2)
      }
    }

    diagnosingOutput.value = output
    isDiagnosingTyping.value = false
  }

  // ============== PLANNING 转入(SSE 流式 → 完成后 parsePlanningText) ==============
  async function continueToPlanning() {
    state.value = 'PLANNING'
    planningStreamingText.value = ''

    const reflections = reflectingAnswers.value.map((answer, i) => ({
      question:
        reflectingQuestions.value[i] ?? MOCK_REFLECTING_QUESTIONS[i] ?? '',
      answer,
    }))
    const diagText = (diagnosingOutput.value?.paragraphs ?? [])
      .map((p) => p.text)
      .join('\n\n') || '(diagnosing 文本暂缺)'

    let fullText = ''
    let useFallback = true
    try {
      const startTime = Date.now()
      await streamPlanningHTTP(
        DEV_SESSION_ID,
        {
          messages: activeMessages.value,
          parsing_output: parsingText.value,
          reflections,
          diagnosing_output: diagText,
        },
        (chunk) => {
          planningStreamingText.value += chunk
          fullText += chunk
        },
      )
      useFallback = false
      // eslint-disable-next-line no-console
      console.info(`[PLANNING-stream] ${Date.now() - startTime}ms 完成`)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[PLANNING-stream] 流式失败,降级同步:', e)
      planningStreamingText.value = ''
      fullText = ''
    }

    let direction = MOCK_PLANNING
    if (!useFallback && fullText) {
      direction = parsePlanningText(fullText)
    } else {
      try {
        const r = await runPlanning(DEV_SESSION_ID, {
          messages: activeMessages.value,
          parsing_output: parsingText.value,
          reflections,
          diagnosing_output: diagText,
        })
        if (r.ok) direction = parsePlanningText(r.data.text)
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.warn('[PLANNING] 同步也失败,回退 mock:', e2)
      }
    }

    planning.value = direction
  }

  // ============== PLANNING → DRAFTING(三选一)(真调 + mock 回退) ==============
  async function planningTryReply() {
    state.value = 'DRAFTING'

    let cards: ReplyDraft[] = MOCK_DRAFTING
    try {
      const reflections = reflectingAnswers.value.map((answer, i) => ({
        question:
          reflectingQuestions.value[i] ??
          MOCK_REFLECTING_QUESTIONS[i] ??
          '',
        answer,
      }))
      const diagText = (diagnosingOutput.value?.paragraphs ?? [])
        .map((p) => p.text)
        .join('\n\n')
      const planningText = planning.value
        ? [
            planning.value.title,
            planning.value.what_to_do,
            planning.value.why,
            planning.value.red_line,
            planning.value.fallback,
          ].filter(Boolean).join('\n\n')
        : ''

      const r = await runDrafting(DEV_SESSION_ID, {
        messages: activeMessages.value,
        parsing_output: parsingText.value,
        reflections,
        diagnosing_output: diagText || '(diagnosing 文本暂缺)',
        planning_output: planningText || '(planning 文本暂缺)',
      })
      if (r.ok) {
        cards = r.data.cards.map((c) => ({
          id: `draft-${c.index}`,
          direction: `方向 ${c.index + 1} · ${c.direction_label}`,
          text: c.reply_text,
          what_it_does: c.what_it_does,
          good_for: c.good_for,
          trade_off: c.trade_off,
        }))
        // eslint-disable-next-line no-console
        console.info(
          `[DRAFTING] ${r.data.duration_ms}ms · ${r.data.usage.input_tokens}/${r.data.usage.output_tokens} tokens · persona=${r.data.persona_passed ? '✓' : '✗'}`,
        )
      } else {
        // eslint-disable-next-line no-console
        console.warn('[DRAFTING] 真 API 失败,回退 mock:', r.error)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DRAFTING] 真 API 异常,回退 mock:', e)
    }

    drafting.value = cards
  }

  function planningPutAside() {
    closingMessage.value = '行,今晚就这样。睡一觉,明天再说。'
    state.value = 'CLOSED'
  }

  function planningOwnIdea() {
    // 重新生成 PLANNING
    planning.value = null
    setTimeout(() => {
      planning.value = MOCK_PLANNING // mock 重复一次,真实场景换方向
    }, 1000)
  }

  function backFromPlanning() {
    state.value = 'DIAGNOSING'
  }

  // ============== DRAFTING(选话术) ==============
  function selectReply(replyId: string) {
    selectedReplyId.value = replyId
    closingMessage.value = '行,试试看。回头告诉我她怎么回。'
    state.value = 'CLOSED'
  }

  function tonightNoSend() {
    closingMessage.value = '行,今晚就这样。睡一觉,明天再说。'
    state.value = 'CLOSED'
  }

  function backFromDrafting() {
    state.value = 'PLANNING'
  }

  // ============== 通用回退 ==============
  function backFromDiagnosing() {
    state.value = 'REFLECTING'
  }

  return {
    // 数据
    state,
    sessionId,
    relationshipName,
    relationshipStage,
    parsingText,
    parsingDone,
    isParsingTyping,
    reflectingMessages,
    reflectingQuestionIndex,
    reflectingAnswers,
    diagnosingOutput,
    diagnosingStreamingText,
    isDiagnosingTyping,
    planning,
    planningStreamingText,
    drafting,
    selectedReplyId,
    closingMessage,
    isFinal,
    // actions
    startMockReplay,
    startReplayWithMessages,
    reset,
    submitReflectingAnswer,
    continueToPlanning,
    planningTryReply,
    planningPutAside,
    planningOwnIdea,
    backFromPlanning,
    selectReply,
    tonightNoSend,
    backFromDrafting,
    backFromDiagnosing,
  }
})
