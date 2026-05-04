import { describe, it, expect } from 'vitest'
import {
  checkPersona,
  assertPersona,
  PersonaViolationError,
  listForbiddenPhrases,
} from '../ai/persona-check.js'

describe('persona-check', () => {
  describe('checkPersona - 干净文本', () => {
    it('老 K 风格的句子全过', () => {
      const text = '我跟你说真的,这事我看是这样。她不是在退,是有事。'
      const r = checkPersona(text)
      expect(r.passed).toBe(true)
      expect(r.violations).toEqual([])
    })

    it('空字符串返回 passed', () => {
      expect(checkPersona('').passed).toBe(true)
    })
  })

  describe('checkPersona - 违规词', () => {
    it('抓"我理解你的感受"', () => {
      const r = checkPersona('我理解你的感受,你应该这样')
      expect(r.passed).toBe(false)
      expect(r.violations[0]).toMatchObject({
        kind: 'forbidden_phrase',
        matched: '我理解你的感受',
      })
    })

    it('抓"我建议"', () => {
      const r = checkPersona('我建议你冷静一下')
      expect(r.violations.some((v) => v.matched === '我建议')).toBe(true)
    })

    it('抓报告体"首先...其次"', () => {
      const r = checkPersona('首先,你要冷静。其次,看清局面。')
      const matched = r.violations.map((v) => v.matched)
      expect(matched).toContain('首先')
      expect(matched).toContain('其次')
    })

    it('同一违规词多次出现都被记录', () => {
      const r = checkPersona('让我们一起,让我们看看')
      expect(
        r.violations.filter((v) => v.matched === '让我们').length,
      ).toBe(2)
    })

    it('违规位置是字符偏移', () => {
      const text = 'aaa我建议bbb'
      const r = checkPersona(text)
      const v = r.violations.find((x) => x.matched === '我建议')!
      expect(v.position).toBe(3)
    })
  })

  describe('checkPersona - emoji', () => {
    it('抓常见笑脸 emoji', () => {
      const r = checkPersona('懂了😂')
      expect(r.violations.some((v) => v.kind === 'emoji')).toBe(true)
    })

    it('allowEmoji 跳过 emoji 检查', () => {
      const r = checkPersona('懂了😂', { allowEmoji: true })
      expect(r.violations.filter((v) => v.kind === 'emoji')).toEqual([])
    })

    it('抓 ❤️ 这种带 variation selector 的 emoji', () => {
      const r = checkPersona('好的❤️')
      expect(r.violations.some((v) => v.kind === 'emoji')).toBe(true)
    })

    it('纯中文不被误判', () => {
      const r = checkPersona('这事我看是这样,你别急。')
      expect(r.violations.filter((v) => v.kind === 'emoji')).toEqual([])
    })
  })

  describe('checkPersona - 排序与额外规则', () => {
    it('violations 按 position 升序', () => {
      const r = checkPersona('其次说,首先做')
      const positions = r.violations.map((v) => v.position)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    })

    it('extraForbidden 加自定义违规词', () => {
      const r = checkPersona('搞定她', { extraForbidden: ['搞定'] })
      expect(r.violations.some((v) => v.matched === '搞定')).toBe(true)
    })
  })

  describe('assertPersona', () => {
    it('过则不抛', () => {
      expect(() => assertPersona('我跟你说真的')).not.toThrow()
    })

    it('违规则抛 PersonaViolationError', () => {
      expect(() => assertPersona('我理解你的感受')).toThrow(
        PersonaViolationError,
      )
    })

    it('错误信息包含 summary 与违规列表', () => {
      try {
        assertPersona('我理解你的感受,我建议你冷静')
        expect.fail('应该抛错')
      } catch (e) {
        if (!(e instanceof PersonaViolationError)) throw e
        expect(e.violations.length).toBeGreaterThanOrEqual(2)
        expect(e.message).toContain('我理解你的感受')
        expect(e.message).toContain('我建议')
      }
    })
  })

  describe('listForbiddenPhrases', () => {
    it('返回非空只读列表', () => {
      const list = listForbiddenPhrases()
      expect(list.length).toBeGreaterThan(5)
      expect(list).toContain('我理解你的感受')
    })
  })
})
