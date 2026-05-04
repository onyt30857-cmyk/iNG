// 复盘状态机单测 - spec-005 §3.1 §3.3 §6.1
// 纯逻辑测试,不接 db。driver 集成测试在 replay-state.service.test.ts。

import { describe, it, expect } from 'vitest'
import { createActor } from 'xstate'
import { replayMachine } from '../state-machines/replay.machine.js'

function startMachine() {
  const actor = createActor(replayMachine, {
    input: {
      session_id: 'sess-1',
      user_id: 'user-1',
      relationship_id: 'rel-1',
    },
  })
  actor.start()
  return actor
}

describe('replay state machine', () => {
  it('初始状态 = ENTRY,context 初始化正确', () => {
    const actor = startMachine()
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('ENTRY')
    expect(snap.context.session_id).toBe('sess-1')
    expect(snap.context.crisis_detected).toBe(false)
    expect(snap.context.short_answer_warned).toBe(false)
    expect(snap.context.history.length).toBe(1)
    expect(snap.context.history[0]?.state).toBe('ENTRY')
    actor.stop()
  })

  it('ENTRY → PARSING 触发 OCR_DONE,parsing 写入 context', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: { events: [] } })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('PARSING')
    expect(snap.context.parsing).toEqual({ events: [] })
    expect(snap.context.history.length).toBe(2) // ENTRY + PARSING
    actor.stop()
  })

  it('OCR_FAILED 留在 ENTRY(spec-005 §3.3 兜底)', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_FAILED' })
    expect(actor.getSnapshot().value).toBe('ENTRY')
    actor.stop()
  })

  it('PARSING → REFLECTING 触发 PARSING_DONE,questions 写入', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: { events: [] } })
    actor.send({
      type: 'PARSING_DONE',
      reflecting_questions: ['你想从这次聊天里看到什么?', '你最在意她哪句话?', '你觉得她在想什么?'],
    })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('REFLECTING')
    expect(snap.context.reflecting_questions.length).toBe(3)
    actor.stop()
  })

  it('REFLECTING 答案够长 → DIAGNOSING', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '我希望知道她到底是不是真的对我有意思,因为最近她回消息变慢了',
        '她说她最近很累那句让我有点担心是我的原因',
        '我猜她可能是真的工作压力大,但也可能在躲我',
      ],
    })
    expect(actor.getSnapshot().value).toBe('DIAGNOSING')
    expect(actor.getSnapshot().context.reflection_answers.length).toBe(3)
    actor.stop()
  })

  it('REFLECTING 答案太短第一次 → 留 REFLECTING + 标记 warned', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({ type: 'ANSWER_SUBMITTED', answers: ['短', '太短了', '更短'] })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('REFLECTING')
    expect(snap.context.short_answer_warned).toBe(true)
    actor.stop()
  })

  it('REFLECTING 答案太短第二次(已 warned) → 直接 DIAGNOSING 放过', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({ type: 'ANSWER_SUBMITTED', answers: ['短', '短', '短'] })
    expect(actor.getSnapshot().value).toBe('REFLECTING')
    actor.send({ type: 'ANSWER_SUBMITTED', answers: ['依旧短', '依旧短', '依旧短'] })
    expect(actor.getSnapshot().value).toBe('DIAGNOSING')
    actor.stop()
  })

  it('DIAGNOSING 普通 → PLANNING', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: { summary: 'ok' }, crisis_detected: false })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('PLANNING')
    expect(snap.context.diagnosing).toEqual({ summary: 'ok' })
    expect(snap.context.crisis_detected).toBe(false)
    actor.stop()
  })

  it('🛡️ DIAGNOSING 危机检测 → 直接 CLOSED + crisis_detected=true', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: { warning: 'crisis' }, crisis_detected: true })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('CLOSED')
    expect(snap.context.crisis_detected).toBe(true)
    expect(snap.status).toBe('done')
    actor.stop()
  })

  it('PLANNING → DRAFTING (TRY_REPLY)', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: {}, crisis_detected: false })
    actor.send({ type: 'PLANNING_DONE', output: { directions: [] } })
    actor.send({ type: 'TRY_REPLY' })
    expect(actor.getSnapshot().value).toBe('DRAFTING')
    actor.stop()
  })

  it('PLANNING → CLOSED (PUT_ASIDE)', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: {}, crisis_detected: false })
    actor.send({ type: 'PUT_ASIDE' })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('CLOSED')
    expect(snap.status).toBe('done')
    actor.stop()
  })

  it('DRAFTING SELECT_REPLY → CLOSED + selected_reply_id', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: {}, crisis_detected: false })
    actor.send({ type: 'TRY_REPLY' })
    actor.send({ type: 'SELECT_REPLY', reply_id: 'reply-abc' })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('CLOSED')
    expect(snap.context.selected_reply_id).toBe('reply-abc')
    actor.stop()
  })

  it('DRAFTING TONIGHT_NO_SEND → CLOSED(不选话术)', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: {}, crisis_detected: false })
    actor.send({ type: 'TRY_REPLY' })
    actor.send({ type: 'TONIGHT_NO_SEND' })
    const snap = actor.getSnapshot()
    expect(snap.value).toBe('CLOSED')
    expect(snap.context.selected_reply_id).toBeNull()
    actor.stop()
  })

  it('PLANNING BACK_TO_DIAGNOSING 回退(spec-005 §3.4)', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: {}, crisis_detected: false })
    actor.send({ type: 'BACK_TO_DIAGNOSING' })
    expect(actor.getSnapshot().value).toBe('DIAGNOSING')
    actor.stop()
  })

  it('PLANNING OWN_IDEA 重新生成(re-enter PLANNING)', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: {}, crisis_detected: false })
    const beforePlanning = actor.getSnapshot().context.history.length
    actor.send({ type: 'OWN_IDEA' })
    expect(actor.getSnapshot().value).toBe('PLANNING')
    // re-enter 会再 push 一条 history
    expect(actor.getSnapshot().context.history.length).toBeGreaterThan(beforePlanning)
    actor.stop()
  })

  it('CLOSED 是 final,不能再触发事件', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    actor.send({ type: 'PARSING_DONE', reflecting_questions: [] })
    actor.send({
      type: 'ANSWER_SUBMITTED',
      answers: [
        '这是一个超过二十字的有效答案,符合最小长度要求一',
        '同样足够长的第二个答案,内容充实有诚意嘛能用了',
        '第三个答案也写得够长够认真嘛,凑够二十个字啦',
      ],
    })
    actor.send({ type: 'DIAGNOSING_DONE', output: {}, crisis_detected: false })
    actor.send({ type: 'PUT_ASIDE' })
    expect(actor.getSnapshot().status).toBe('done')
    expect(actor.getSnapshot().can({ type: 'OCR_DONE', parsing: {} })).toBe(false)
    actor.stop()
  })

  it('history 记录每次进出时间', () => {
    const actor = startMachine()
    actor.send({ type: 'OCR_DONE', parsing: {} })
    const h = actor.getSnapshot().context.history
    expect(h.length).toBe(2)
    // ENTRY 应该有 entered_at 和 exited_at
    expect(h[0]?.state).toBe('ENTRY')
    expect(h[0]?.entered_at).toBeDefined()
    expect(h[0]?.exited_at).toBeDefined()
    // PARSING 只有 entered_at
    expect(h[1]?.state).toBe('PARSING')
    expect(h[1]?.entered_at).toBeDefined()
    expect(h[1]?.exited_at).toBeUndefined()
    actor.stop()
  })
})
