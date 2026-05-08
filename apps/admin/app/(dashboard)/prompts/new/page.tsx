'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Info, CheckCircle2 } from 'lucide-react'
import { adminPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// 场景选项 — 跟代码里 prompt name 严格对齐(写错系统不认)
const SCENES = [
  {
    value: 'conversation_turn',
    label: '老 K 主对话',
    desc: '用户在 App 里跟老 K 直接聊天时,老 K 怎么回话。这是改动最频繁的一个。',
  },
  {
    value: 'parsing',
    label: '看截图复盘',
    desc: '用户上传聊天截图后,老 K 怎么解读对方在说什么、关系当前状态。',
  },
  {
    value: 'ocr',
    label: '识图取字',
    desc: '从聊天截图里把文字提取出来。一般不需要改。',
  },
  {
    value: 'intent_classifier',
    label: '意图判断',
    desc: '系统快速识别用户这条消息是想吐槽 / 求建议 / 求话术 / 还是只是闲聊。',
  },
  {
    value: 'long_term_memory',
    label: '长期记忆压缩',
    desc: '老 K 怎么把过去的对话浓缩成"她的人物档案"。',
  },
]

export default function NewPromptVersionPage() {
  const router = useRouter()
  const [scene, setScene] = useState('')
  const [content, setContent] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setSubmitting(true)
    const res = await adminPost<{ id: string; name: string; version: number }>(
      '/v1/admin/prompts/versions',
      { name: scene, content, notes: notes || undefined },
    )
    setSubmitting(false)
    if (res.ok) {
      router.push(`/prompts/${encodeURIComponent(res.data.name)}`)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  const selectedScene = SCENES.find((s) => s.value === scene)
  const charCount = content.length

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/prompts">
          <ArrowLeft className="h-4 w-4" /> 返回 Prompt 列表
        </Link>
      </Button>

      {/* 标题 + 说明 */}
      <div>
        <h1 className="text-2xl font-semibold">准备一版新的"老 K 说话方式"</h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          这页让你写一份**新的指南**,告诉老 K 在某个场景下应该怎么说话。
          写完只是**保存草稿**,不会立刻让真实用户看到 — 你回列表后还要再点"上线"才会真正生效。
        </p>
      </div>

      {/* 表单 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">填三件事就行</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {/* === 场景选择 === */}
            <div className="space-y-2">
              <Label>1. 老 K 用在哪个场景?</Label>
              <div className="grid gap-2">
                {SCENES.map((s) => (
                  <label
                    key={s.value}
                    className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                      scene === s.value
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:bg-muted/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="scene"
                      value={s.value}
                      checked={scene === s.value}
                      onChange={(e) => setScene(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{s.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                        系统名:{s.value}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* === 说话指南内容 === */}
            <div className="space-y-2">
              <Label htmlFor="content">2. 老 K 的"说话指南"</Label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={14}
                placeholder={
                  scene
                    ? `把现在 ${selectedScene?.label} 场景下老 K 的指南整段粘贴进来。\n\n找开发要这个文件:\nlianai-dev-kit/03-prompts/${scene}.md\n\n复制里面所有内容(可能几千字),整段贴到这里。`
                    : '先在上面选一个场景,这里会告诉你具体粘哪个文件'
                }
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    第一次进来这页?**复制开发那边现成的内容**就行 — 找开发要
                    {scene ? (
                      <code className="bg-muted/40 px-1 mx-1 rounded">{`03-prompts/${scene}.md`}</code>
                    ) : (
                      <code className="bg-muted/40 px-1 mx-1 rounded">03-prompts/&lt;场景名&gt;.md</code>
                    )}
                    文件,整段贴进来
                  </span>
                </span>
                <span>
                  {charCount > 0 ? `已粘贴 ${charCount.toLocaleString()} 字` : '空'}
                </span>
              </div>
            </div>

            {/* === 改动说明 === */}
            <div className="space-y-2">
              <Label htmlFor="notes">3. 这次改了什么?(给将来的自己看)</Label>
              <Input
                id="notes"
                placeholder='例:"把当前线上版本备份入库" / "加了 3 句话内说完的硬约束,修复啰嗦问题"'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                可选,但**强烈建议填** — 三个月后回来你会感谢现在认真写说明的自己。
              </p>
            </div>

            {/* === 操作影响 === */}
            <div className="rounded-lg border border-green-200 bg-green-50/50 dark:bg-green-950/20 p-4 space-y-2 text-sm">
              <p className="font-medium flex items-center gap-2 text-green-800 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                点"创建草稿"之后会发生什么?
              </p>
              <ul className="space-y-1.5 text-[13px] text-muted-foreground ml-6 list-disc">
                <li>系统保存这版,**显示"未上线"**(草稿状态)</li>
                <li>**不会影响真实用户** — 老 K 还是按当前线上的旧版本说话</li>
                <li>你回到 Prompt 列表 → 点这个新版的"部署"按钮 → 才会真上线</li>
                <li>上线前可以先点"测试"跑 20 条样本,系统帮你打分,确认值得上线</li>
                <li>已经发出的对话不会被改写,只影响**之后**的新对话</li>
              </ul>
            </div>

            {errorMsg && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}
          </CardContent>

          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button type="button" variant="ghost" asChild>
              <Link href="/prompts">取消</Link>
            </Button>
            <Button
              type="submit"
              disabled={submitting || !scene || !content.trim()}
            >
              {submitting ? '创建中…' : '创建草稿(不会立刻上线)'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
