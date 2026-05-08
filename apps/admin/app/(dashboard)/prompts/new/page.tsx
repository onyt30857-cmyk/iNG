'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { adminPost } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewPromptVersionPage() {
  const router = useRouter()
  const [name, setName] = useState('')
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
      { name: name.trim(), content, notes: notes || undefined },
    )
    setSubmitting(false)
    if (res.ok) {
      router.push(`/prompts/${encodeURIComponent(res.data.name)}`)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/prompts">
          <ArrowLeft className="h-4 w-4" /> 返回 Prompt 列表
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>新增 Prompt 版本</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Prompt 名(同名自动 +1 version)</Label>
              <Input
                id="name"
                placeholder="conversation_turn / parsing / ocr / intent_classifier"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="content">Content(完整 system prompt)</Label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={20}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                从 03-prompts/{name || '<name>'}.md 复制粘贴。Markdown 格式 OK。
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes">说明(可选)</Label>
              <Input
                id="notes"
                placeholder='例:"加 3 句话内说完硬约束,修复啰嗦问题"'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          </CardContent>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button type="button" variant="ghost" asChild>
              <Link href="/prompts">取消</Link>
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || !content.trim()}>
              {submitting ? '创建中…' : '创建(staging)'}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardContent className="py-4 text-xs text-muted-foreground">
          创建后是 staging 版本(不上线)。在版本详情页点"部署"才会真生效。
        </CardContent>
      </Card>
    </div>
  )
}
