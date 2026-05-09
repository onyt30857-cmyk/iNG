import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  loadPrompt,
  extractSystemPrompt,
  clearPromptCache,
} from '../ai/prompt-loader.js'

describe('prompt-loader', () => {
  beforeEach(() => clearPromptCache())

  describe('extractSystemPrompt', () => {
    it('提取 System Prompt 节里的第一个 fence', () => {
      const md = `# 标题

## 1. 介绍
内容

## 3. System Prompt(完整文本)

\`\`\`
你是老白。
说话直接但不冷。
\`\`\`

## 4. 下一节
其他内容
`
      const prompt = extractSystemPrompt(md, 'parsing')
      expect(prompt).toBe('你是老白。\n说话直接但不冷。')
    })

    it('容忍标题里的备注后缀(状态 A 完整版 / 完整文本)', () => {
      const md = `## 7. System Prompt(状态 A 完整版)\n\n\`\`\`\n这是 prompt\n\`\`\`\n`
      const prompt = extractSystemPrompt(md, 'drafting')
      expect(prompt).toBe('这是 prompt')
    })

    it('忽略 System Prompt 节之前的其他 fence', () => {
      const md = `## 2. 输入

\`\`\`typescript
interface X {}
\`\`\`

## 3. System Prompt

\`\`\`
真正的 prompt
\`\`\`
`
      const prompt = extractSystemPrompt(md, 'parsing')
      expect(prompt).toBe('真正的 prompt')
    })

    it('找不到 System Prompt 节抛错', () => {
      const md = `## 1. 介绍\n## 2. 其他`
      expect(() => extractSystemPrompt(md, 'crisis')).toThrow(
        /找不到 System Prompt 节/,
      )
    })

    it('节里找不到 fence 抛错', () => {
      const md = `## 3. System Prompt\n\n这里全是文字,没有 fence。`
      expect(() => extractSystemPrompt(md, 'parsing')).toThrow(/找不到.*fence/)
    })
  })

  describe('loadPrompt(真实文件)', () => {
    it('加载 parsing 包含老白人格关键句', async () => {
      const prompt = await loadPrompt('parsing')
      expect(prompt).toMatch(/你是老 ?K/)
      expect(prompt.length).toBeGreaterThan(500)
    })

    it('5 个标准 prompt 都能加载且非空', async () => {
      const names = [
        'parsing',
        'reflecting',
        'diagnosing',
        'planning',
        'drafting',
      ] as const
      for (const name of names) {
        const prompt = await loadPrompt(name)
        expect(prompt.length).toBeGreaterThan(100)
      }
    })

    it('cache 命中:同一 name 第二次不读盘', async () => {
      const tmp = await mkdtemp(path.join(tmpdir(), 'prompt-loader-'))
      try {
        const file = path.join(tmp, 'parsing.md')
        await writeFile(
          file,
          `## 1. System Prompt\n\n\`\`\`\nA\n\`\`\`\n`,
        )
        const a = await loadPrompt('parsing', { promptsDir: tmp })
        // 改文件内容,但 cache 里仍是 A
        await writeFile(
          file,
          `## 1. System Prompt\n\n\`\`\`\nB\n\`\`\`\n`,
        )
        const b = await loadPrompt('parsing', { promptsDir: tmp })
        expect(a).toBe('A')
        expect(b).toBe('A')
        // noCache 显式跳过
        const c = await loadPrompt('parsing', {
          promptsDir: tmp,
          noCache: true,
        })
        expect(c).toBe('B')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    it('文件不存在抛错', async () => {
      await expect(
        loadPrompt('parsing', { promptsDir: '/no-such-dir-xyz' }),
      ).rejects.toThrow()
    })
  })
})
