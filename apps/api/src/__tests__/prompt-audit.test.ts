import { describe, it, expect } from 'vitest'
import {
  auditPromptContext,
  assertNoLeak,
  PromptLeakError,
} from '../ai/prompt-audit.js'

describe('prompt-audit', () => {
  describe('无泄漏', () => {
    it('其他关系列表为空 → ok', () => {
      const r = auditPromptContext('小雨这周比较忙', { otherIdentifiers: [] })
      expect(r.ok).toBe(true)
      expect(r.leaks).toEqual([])
    })

    it('其他关系名不出现在 prompt 里 → ok', () => {
      const r = auditPromptContext('小雨这周比较忙', {
        otherIdentifiers: ['小美', '小玲'],
      })
      expect(r.ok).toBe(true)
    })
  })

  describe('泄漏检测', () => {
    it('其他关系名出现在 prompt 里 → !ok,记录位置', () => {
      const text = '今天小雨说她最近在忙小美那边的事'
      const r = auditPromptContext(text, {
        otherIdentifiers: ['小美', '小玲'],
      })
      expect(r.ok).toBe(false)
      expect(r.leaks).toHaveLength(1)
      expect(r.leaks[0]).toMatchObject({
        identifier: '小美',
        position: text.indexOf('小美'),
      })
    })

    it('多个关系名同时泄漏都被记录', () => {
      const r = auditPromptContext('小美和小玲是我以前认识的', {
        otherIdentifiers: ['小美', '小玲'],
      })
      expect(r.leaks.map((l) => l.identifier).sort()).toEqual(['小玲', '小美'])
    })

    it('同一名字多次出现都记录', () => {
      const r = auditPromptContext('小美来了,小美又走了,小美回来了', {
        otherIdentifiers: ['小美'],
      })
      expect(r.leaks).toHaveLength(3)
    })

    it('泄漏按位置升序排列', () => {
      const r = auditPromptContext('小玲先到,小美后到', {
        otherIdentifiers: ['小美', '小玲'],
      })
      const ps = r.leaks.map((l) => l.position)
      expect(ps).toEqual([...ps].sort((a, b) => a - b))
    })
  })

  describe('边界与误报防御', () => {
    it('长度 < 2 的 identifier 被忽略(避免单字误报)', () => {
      // "她"是单字,不该被当成关系识别词
      const r = auditPromptContext('她最近不爱说话', {
        otherIdentifiers: ['她'],
      })
      expect(r.ok).toBe(true)
    })

    it('空 identifier 被忽略', () => {
      const r = auditPromptContext('小雨这事', {
        otherIdentifiers: ['', '小雨'],
      })
      // '小雨' 长度 2,出现在 prompt 中 → 应该泄漏
      expect(r.leaks.map((l) => l.identifier)).toEqual(['小雨'])
    })

    it('英文关系名也工作', () => {
      const r = auditPromptContext('Alice mentioned the trip', {
        otherIdentifiers: ['Alice', 'Bob'],
      })
      expect(r.leaks.map((l) => l.identifier)).toEqual(['Alice'])
    })
  })

  describe('assertNoLeak', () => {
    it('无泄漏不抛', () => {
      expect(() =>
        assertNoLeak('小雨', { otherIdentifiers: ['小美'] }),
      ).not.toThrow()
    })

    it('有泄漏则抛 PromptLeakError', () => {
      expect(() =>
        assertNoLeak('小雨和小美', { otherIdentifiers: ['小美'] }),
      ).toThrow(PromptLeakError)
    })

    it('错误带上 leaks 列表', () => {
      try {
        assertNoLeak('小雨说她遇到小美', {
          otherIdentifiers: ['小美'],
        })
        expect.fail('应该抛错')
      } catch (e) {
        if (!(e instanceof PromptLeakError)) throw e
        expect(e.leaks).toHaveLength(1)
        expect(e.leaks[0]?.identifier).toBe('小美')
      }
    })
  })
})
