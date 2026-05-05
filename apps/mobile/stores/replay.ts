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
  runReflecting,
  runDiagnosing,
  type ParsingMessage,
} from '../api/replay.api'
import { DEV_SESSION_ID } from '../utils/dev-token'

// dev 阶段 PARSING 用的 hardcoded messages(模拟 OCR 已完成的对话)
// spec-004 OCR 实施后,messages 从用户上传截图 → OCR 流程拿到
const DEV_PARSING_MESSAGES: ParsingMessage[] = [
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

  // Planning
  const planning = ref<PlanningDirection | null>(null)

  // Drafting
  const drafting = ref<ReplyDraft[]>([])
  const selectedReplyId = ref<string | null>(null)

  // Closed
  const closingMessage = ref('')

  const isFinal = computed(() => state.value === 'CLOSED')

  // ============== 主流程触发(从 entry 抽屉提交后调) ==============
  function startMockReplay() {
    reset()
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
    planning.value = null
    drafting.value = []
    selectedReplyId.value = null
    closingMessage.value = ''
  }

  // ============== PARSING(真调 Anthropic + 打字机展示) ==============
  // 真 API 调用拿到完整文本后,用打字机一字一字 reveal,体感跟流式接近。
  // SSE 真流式作为后续 spec-005 §3.x 优化。
  // 真 API 失败 → 回退 MOCK_PARSING,产品体验不被打断。
  async function streamParsing() {
    isParsingTyping.value = true
    parsingText.value = ''

    // 1. 拿真老 K 输出(失败回退 mock)
    let target = MOCK_PARSING.summary
    try {
      const r = await runParsing(DEV_SESSION_ID, {
        messages: DEV_PARSING_MESSAGES,
        entry_note: DEV_PARSING_ENTRY_NOTE,
      })
      if (r.ok) {
        target = r.data.text
        // eslint-disable-next-line no-console
        console.info(
          `[PARSING] ${r.data.duration_ms}ms · ${r.data.usage.input_tokens}/${r.data.usage.output_tokens} tokens · persona=${r.data.persona_passed ? '✓' : '✗'}`,
        )
      } else {
        // eslint-disable-next-line no-console
        console.warn('[PARSING] 真 API 失败,回退 mock:', r.error)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[PARSING] 真 API 异常,回退 mock:', e)
    }

    // 2. 打字机展示(已有逻辑保留)
    let i = 0
    const speed = 28 // ms / 字
    const tick = () => {
      if (i >= target.length) {
        isParsingTyping.value = false
        parsingDone.value = true
        setTimeout(() => transitionToReflecting(), 800)
        return
      }
      parsingText.value = target.slice(0, i + 1)
      i += 1
      setTimeout(tick, speed)
    }
    tick()
  }

  // ============== REFLECTING 转入(真调 + mock 回退) ==============
  async function transitionToReflecting() {
    state.value = 'REFLECTING'

    // 真 API:用 PARSING 阶段拿到的 parsingText(可能是真 Claude 文本,可能是 mock)
    let questions: string[] = [...MOCK_REFLECTING_QUESTIONS]
    try {
      const r = await runReflecting(DEV_SESSION_ID, {
        messages: DEV_PARSING_MESSAGES,
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

  // ============== DIAGNOSING 转入(真调 + mock 回退) ==============
  async function transitionToDiagnosing() {
    state.value = 'DIAGNOSING'
    isDiagnosingTyping.value = true

    let output: DiagnosingOutput = MOCK_DIAGNOSING
    try {
      // 把 3 个 questions × 3 个 answers 配对
      const reflections = reflectingAnswers.value.map((answer, i) => ({
        question:
          reflectingQuestions.value[i] ??
          MOCK_REFLECTING_QUESTIONS[i] ??
          '',
        answer,
      }))

      const r = await runDiagnosing(DEV_SESSION_ID, {
        messages: DEV_PARSING_MESSAGES,
        parsing_output: parsingText.value,
        reflections,
        scenario_primary: DEV_SCENARIO_PRIMARY,
      })
      if (r.ok) {
        // 真 API 输出散文,按 \n\n 切 paragraphs(羞耻处理标记后续 spec-005 优化时再加)
        const paragraphs = r.data.text
          .split(/\n\s*\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((text) => ({ text, is_shame_handling: false }))
        output = { paragraphs, crisis_detected: false }
        // eslint-disable-next-line no-console
        console.info(
          `[DIAGNOSING] ${r.data.duration_ms}ms · ${r.data.usage.input_tokens}/${r.data.usage.output_tokens} tokens · persona=${r.data.persona_passed ? '✓' : '✗'}`,
        )
      } else {
        // eslint-disable-next-line no-console
        console.warn('[DIAGNOSING] 真 API 失败,回退 mock:', r.error)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[DIAGNOSING] 真 API 异常,回退 mock:', e)
    }

    diagnosingOutput.value = output
    isDiagnosingTyping.value = false
  }

  function continueToPlanning() {
    state.value = 'PLANNING'
    setTimeout(() => {
      planning.value = MOCK_PLANNING
    }, 600)
  }

  // ============== PLANNING(三选一) ==============
  function planningTryReply() {
    state.value = 'DRAFTING'
    setTimeout(() => {
      drafting.value = MOCK_DRAFTING
    }, 1000)
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
    isDiagnosingTyping,
    planning,
    drafting,
    selectedReplyId,
    closingMessage,
    isFinal,
    // actions
    startMockReplay,
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
