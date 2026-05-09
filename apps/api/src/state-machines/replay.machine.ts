// 复盘状态机 - spec-005 §3.1 §3.3
//
// 7 个状态: ENTRY → PARSING → REFLECTING → DIAGNOSING → PLANNING → DRAFTING → CLOSED(+ CRISIS 分支)
//
// 设计原则:
// - 纯状态机,不依赖 prisma / 不调 LLM。
// - LLM 调用在外部 ai-orchestrator(spec-005 后续阶段)完成,完成后 send 事件回来。
// - 每次状态进入 push 一条 history 记录(state_context.history)用于审计和性能监控。

import { setup, assign } from 'xstate'

// ===== Context(序列化到 sessions.state_context) =====

export interface ReplayHistoryEntry {
  state: string
  entered_at: string
  exited_at?: string
}

export interface ReplayContext {
  /** 复盘会话 id */
  session_id: string
  /** 用户 id */
  user_id: string
  /** 关系 id - CLAUDE.md §5.1 隔离锚 */
  relationship_id: string

  /** OCR 解析结果(spec-004) */
  parsing: unknown
  /** REFLECTING 阶段的老白三个问题 */
  reflecting_questions: string[]
  /** REFLECTING 阶段用户三段答案 */
  reflection_answers: string[]
  /** 用户答案是否已被温和追问过(spec-005 §3.3,只追问一次) */
  short_answer_warned: boolean
  /** DIAGNOSING 阶段老白看到的诊断结果 */
  diagnosing: unknown
  /** 是否检测到危机信号(spec-005 §3.3) */
  crisis_detected: boolean
  /** PLANNING 阶段方向 */
  planning: unknown
  /** DRAFTING 阶段 3 条话术 */
  drafting: unknown
  /** 用户选了哪条话术 */
  selected_reply_id: string | null
  /** 状态历史(每次进出时间) */
  history: ReplayHistoryEntry[]
}

export const initialReplayContext = (params: {
  session_id: string
  user_id: string
  relationship_id: string
}): ReplayContext => ({
  session_id: params.session_id,
  user_id: params.user_id,
  relationship_id: params.relationship_id,
  parsing: null,
  reflecting_questions: [],
  reflection_answers: [],
  short_answer_warned: false,
  diagnosing: null,
  crisis_detected: false,
  planning: null,
  drafting: null,
  selected_reply_id: null,
  history: [],
})

// ===== Events =====

export type ReplayEvent =
  // ENTRY
  | { type: 'OCR_DONE'; parsing: unknown }
  | { type: 'OCR_FAILED' }
  // PARSING(LLM 完成后)
  | { type: 'PARSING_DONE'; reflecting_questions: string[] }
  // REFLECTING
  | { type: 'ANSWER_SUBMITTED'; answers: string[] }
  // DIAGNOSING(LLM 完成后)
  | { type: 'DIAGNOSING_DONE'; output: unknown; crisis_detected: boolean }
  // PLANNING
  | { type: 'PLANNING_DONE'; output: unknown }
  | { type: 'TRY_REPLY' }
  | { type: 'PUT_ASIDE' }
  | { type: 'OWN_IDEA' }
  // DRAFTING
  | { type: 'DRAFTING_DONE'; output: unknown }
  | { type: 'SELECT_REPLY'; reply_id: string }
  | { type: 'TONIGHT_NO_SEND' }
  // 回退(spec-005 §3.4)
  | { type: 'BACK_TO_REFLECTING' }
  | { type: 'BACK_TO_DIAGNOSING' }
  | { type: 'BACK_TO_PLANNING' }

// ===== 答案校验 =====
const MIN_ANSWER_CHARS = 20

// ===== Machine =====

export const replayMachine = setup({
  types: {
    context: {} as ReplayContext,
    events: {} as ReplayEvent,
    input: {} as { session_id: string; user_id: string; relationship_id: string },
  },
  guards: {
    answersLongEnough: ({ event }) => {
      if (event.type !== 'ANSWER_SUBMITTED') return false
      return event.answers.every((a) => a.trim().length >= MIN_ANSWER_CHARS)
    },
    notWarnedYet: ({ context }) => !context.short_answer_warned,
    crisisDetected: ({ event }) => {
      if (event.type !== 'DIAGNOSING_DONE') return false
      return event.crisis_detected === true
    },
  },
  actions: {
    pushEnterHistory: assign({
      history: ({ context }, params: { state: string }) => [
        ...context.history,
        { state: params.state, entered_at: new Date().toISOString() },
      ],
    }),
    markExitHistory: assign({
      history: ({ context }) => {
        if (context.history.length === 0) return context.history
        const last = context.history[context.history.length - 1]
        if (!last || last.exited_at) return context.history
        return [
          ...context.history.slice(0, -1),
          { ...last, exited_at: new Date().toISOString() },
        ]
      },
    }),
    setParsing: assign({
      parsing: ({ event }) => (event.type === 'OCR_DONE' ? event.parsing : null),
    }),
    setReflectingQuestions: assign({
      reflecting_questions: ({ event }) =>
        event.type === 'PARSING_DONE' ? event.reflecting_questions : [],
    }),
    setReflectionAnswers: assign({
      reflection_answers: ({ event }) =>
        event.type === 'ANSWER_SUBMITTED' ? event.answers : [],
    }),
    markShortAnswerWarned: assign({ short_answer_warned: true }),
    setDiagnosing: assign({
      diagnosing: ({ event }) => (event.type === 'DIAGNOSING_DONE' ? event.output : null),
      crisis_detected: ({ event }) =>
        event.type === 'DIAGNOSING_DONE' ? event.crisis_detected : false,
    }),
    setPlanning: assign({
      planning: ({ event }) => (event.type === 'PLANNING_DONE' ? event.output : null),
    }),
    setDrafting: assign({
      drafting: ({ event }) => (event.type === 'DRAFTING_DONE' ? event.output : null),
    }),
    setSelectedReply: assign({
      selected_reply_id: ({ event }) =>
        event.type === 'SELECT_REPLY' ? event.reply_id : null,
    }),
  },
}).createMachine({
  id: 'replay',
  initial: 'ENTRY',
  context: ({ input }) => initialReplayContext(input),
  states: {
    ENTRY: {
      entry: { type: 'pushEnterHistory', params: { state: 'ENTRY' } },
      exit: 'markExitHistory',
      on: {
        OCR_DONE: {
          target: 'PARSING',
          actions: 'setParsing',
        },
        OCR_FAILED: {
          // 留在 ENTRY,提示用户重试(spec-005 §3.3)
          target: 'ENTRY',
          reenter: false,
        },
      },
    },
    PARSING: {
      entry: { type: 'pushEnterHistory', params: { state: 'PARSING' } },
      exit: 'markExitHistory',
      on: {
        PARSING_DONE: {
          target: 'REFLECTING',
          actions: 'setReflectingQuestions',
        },
      },
    },
    REFLECTING: {
      entry: { type: 'pushEnterHistory', params: { state: 'REFLECTING' } },
      exit: 'markExitHistory',
      on: {
        ANSWER_SUBMITTED: [
          // 答案够长 → 进 DIAGNOSING
          {
            target: 'DIAGNOSING',
            guard: 'answersLongEnough',
            actions: 'setReflectionAnswers',
          },
          // 太短且没追问过 → 留在 REFLECTING,标记 warned
          {
            target: 'REFLECTING',
            guard: 'notWarnedYet',
            reenter: false,
            actions: ['setReflectionAnswers', 'markShortAnswerWarned'],
          },
          // 已经追问过 → 放过去,进 DIAGNOSING(spec-005 §3.3)
          {
            target: 'DIAGNOSING',
            actions: 'setReflectionAnswers',
          },
        ],
      },
    },
    DIAGNOSING: {
      entry: { type: 'pushEnterHistory', params: { state: 'DIAGNOSING' } },
      exit: 'markExitHistory',
      on: {
        DIAGNOSING_DONE: [
          // 检测到危机 → 直接 CLOSED(crisis_detected=true,driver 同时 set sessions.crisis_triggered)
          // 危机干预独立流程在 prompt 层完成,不开新状态机分支
          {
            target: 'CLOSED',
            guard: 'crisisDetected',
            actions: 'setDiagnosing',
          },
          // 正常 → PLANNING
          {
            target: 'PLANNING',
            actions: 'setDiagnosing',
          },
        ],
        BACK_TO_REFLECTING: {
          target: 'REFLECTING',
        },
      },
    },
    PLANNING: {
      entry: { type: 'pushEnterHistory', params: { state: 'PLANNING' } },
      exit: 'markExitHistory',
      on: {
        PLANNING_DONE: {
          actions: 'setPlanning',
        },
        TRY_REPLY: {
          target: 'DRAFTING',
        },
        PUT_ASIDE: {
          target: 'CLOSED',
        },
        OWN_IDEA: {
          // 重新生成 PLANNING(re-enter)
          target: 'PLANNING',
          reenter: true,
        },
        BACK_TO_DIAGNOSING: {
          target: 'DIAGNOSING',
        },
      },
    },
    DRAFTING: {
      entry: { type: 'pushEnterHistory', params: { state: 'DRAFTING' } },
      exit: 'markExitHistory',
      on: {
        DRAFTING_DONE: {
          actions: 'setDrafting',
        },
        SELECT_REPLY: {
          target: 'CLOSED',
          actions: 'setSelectedReply',
        },
        TONIGHT_NO_SEND: {
          target: 'CLOSED',
        },
        BACK_TO_PLANNING: {
          target: 'PLANNING',
        },
      },
    },
    CLOSED: {
      entry: { type: 'pushEnterHistory', params: { state: 'CLOSED' } },
      type: 'final',
    },
  },
})

export type ReplayMachine = typeof replayMachine
