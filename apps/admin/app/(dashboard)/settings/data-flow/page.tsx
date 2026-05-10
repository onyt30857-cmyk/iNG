'use client'

// 数据流配置面板 - spec-m2-004
// 让 Sam 控制"老白每次回复时看到什么数据"

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Settings2, AlertTriangle, CheckCircle2, ImageIcon } from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DataFlowConfig {
  switches: {
    profile_assertions: boolean
    observations: boolean
    language_fingerprint: boolean
    long_term_memory: boolean
    emotion_recognition: boolean
    observation_extractor: boolean
    fingerprint_extractor: boolean
  }
  params: {
    history_window_size: number
    long_term_memory_threshold: number
    long_term_memory_window_size: number
    profile_assertions_limit: number
    observations_limit: number
    fingerprint_extraction_interval: number
  }
  updated_at: string | null
  updated_by: string | null
}

const SWITCH_META: Array<{
  key: keyof DataFlowConfig['switches']
  label: string
  desc: string
}> = [
  {
    key: 'profile_assertions',
    label: '画像数据(profile_assertions)',
    desc: '老白看到她的稳定特征。关掉 = 老白对她的理解像第一次见',
  },
  {
    key: 'observations',
    label: '老白观察(relationship_observations)',
    desc: '老白以前对她的所有观察。关掉 = 老白记不住自己以前怎么想',
  },
  {
    key: 'language_fingerprint',
    label: '用户语气指纹',
    desc: '给的话术贴近用户平时说话风格。关掉 = 话术可能不像兄弟会说的',
  },
  {
    key: 'long_term_memory',
    label: '长期记忆',
    desc: '老白能回忆早期对话。关掉 = 对话超 30 条后早期细节丢失',
  },
  {
    key: 'emotion_recognition',
    label: '当下情绪识别',
    desc: '老白判断她今天是否反常。关掉 = 老白只看历史不看当下',
  },
  {
    key: 'observation_extractor',
    label: '老白回复后异步抽 observation',
    desc: '每轮老白说完异步跑 Haiku 抽"看到的瞬间"。关掉 = 不再产生新 observation',
  },
  {
    key: 'fingerprint_extractor',
    label: '用户语气指纹定期抽取',
    desc: '每 N 条用户消息触发一次 Haiku 抽 fingerprint。关掉 = fingerprint 不再更新',
  },
]

const PARAM_META: Array<{
  key: keyof DataFlowConfig['params']
  label: string
  desc: string
  min: number
  max: number
}> = [
  {
    key: 'history_window_size',
    label: '历史窗口大小',
    desc: '老白每次看最近多少条对话',
    min: 30,
    max: 200,
  },
  {
    key: 'long_term_memory_threshold',
    label: '长期记忆门槛',
    desc: '对话超过多少条触发长期记忆压缩',
    min: 20,
    max: 100,
  },
  {
    key: 'long_term_memory_window_size',
    label: '长期记忆窗口',
    desc: '最近 N 条原文进 prompt,更早的压缩',
    min: 30,
    max: 200,
  },
  {
    key: 'profile_assertions_limit',
    label: '画像取多少条',
    desc: '取最高 priority 的多少条 assertion',
    min: 5,
    max: 50,
  },
  {
    key: 'observations_limit',
    label: '观察取多少条',
    desc: '取最近多少条 observation',
    min: 10,
    max: 100,
  },
  {
    key: 'fingerprint_extraction_interval',
    label: 'fingerprint 触发间隔',
    desc: '每 N 条用户消息触发一次',
    min: 5,
    max: 100,
  },
]

export default function DataFlowSettingsPage() {
  const [config, setConfig] = useState<DataFlowConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [switches, setSwitches] = useState<DataFlowConfig['switches'] | null>(null)
  const [params, setParams] = useState<DataFlowConfig['params'] | null>(null)

  async function load() {
    setLoading(true)
    const res = await adminGet<DataFlowConfig>('/v1/admin/settings/data-flow')
    setLoading(false)
    if (res.ok) {
      setConfig(res.data)
      setSwitches(res.data.switches)
      setParams(res.data.params)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    if (!switches || !params) return

    const res = await adminFetch<DataFlowConfig>('/v1/admin/settings/data-flow', {
      method: 'PATCH',
      body: { switches, params },
    })
    if (res.ok) {
      setConfig(res.data)
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 3000)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">加载中...</div>
  }
  if (!config || !switches || !params) {
    return (
      <div className="p-6 text-sm text-red-600 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        {errorMsg ?? '加载配置失败'}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Settings2 className="h-6 w-6" />
          数据流配置
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          控制"老白每次回复时看到什么数据"。改了立即生效(下个 turn 拉新配置)。
        </p>
      </div>

      <Card>
        <CardContent className="text-sm pt-6 space-y-2 bg-amber-50 dark:bg-amber-950/30 border-amber-200">
          <div className="font-semibold text-amber-900 dark:text-amber-200">
            ⚠ 改前要知道
          </div>
          <ul className="list-disc pl-5 space-y-1 text-amber-900 dark:text-amber-200">
            <li>关掉某个开关 = 老白看不到那部分,可能影响"懂她"质量</li>
            <li>调参数 = 影响老白引用的数据量和触发时机</li>
            <li>改动会落 admin_audit_logs(谁、何时、改前改后都记)</li>
          </ul>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">数据开关</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {SWITCH_META.map((s) => (
              <label
                key={s.key}
                className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-2 rounded"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={switches[s.key]}
                  onChange={(e) =>
                    setSwitches({ ...switches, [s.key]: e.target.checked })
                  }
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">参数调整</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {PARAM_META.map((p) => (
              <div key={p.key} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                <Label className="sm:col-span-1 text-sm font-medium pt-2">
                  {p.label}
                </Label>
                <div className="sm:col-span-2 space-y-1">
                  <Input
                    type="number"
                    min={p.min}
                    max={p.max}
                    value={params[p.key]}
                    onChange={(e) =>
                      setParams({ ...params, [p.key]: Number(e.target.value) })
                    }
                  />
                  <div className="text-xs text-muted-foreground">
                    {p.desc} (范围 {p.min} - {p.max})
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {errorMsg && (
          <div className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {errorMsg}
          </div>
        )}
        {savedAt && (
          <div className="text-sm text-green-600 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> 已保存 {new Date(savedAt).toLocaleTimeString()}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit">保存修改</Button>
          <Button type="button" variant="outline" onClick={load}>
            重置(重新加载)
          </Button>
        </div>

        {config.updated_at && (
          <div className="text-xs text-muted-foreground">
            上次更新:{new Date(config.updated_at).toLocaleString()}
            {config.updated_by ? ` by ${config.updated_by}` : ''}
          </div>
        )}
      </form>

      <UserDefaultAvatarCard />
    </div>
  )
}

// 2026-05-12:用户默认头像(没头像的用户 fallback)
// 改了立即生效 — mobile 端下次拉 settings/user-default-avatar 看到新 URL
function UserDefaultAvatarCard() {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const res = await adminGet<{ url: string | null }>(
      '/v1/admin/settings/user-default-avatar',
    )
    setLoading(false)
    if (res.ok) {
      setUrl(res.data.url)
      setErrorMsg(null)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 1 * 1024 * 1024) {
      setErrorMsg('图片太大,请压到 1MB 以内(建议 256x256 jpeg)')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    setBusy(true)
    setErrorMsg(null)
    const res = await adminFetch<{ url: string | null }>(
      '/v1/admin/settings/user-default-avatar',
      { method: 'POST', body: { data_url: dataUrl } },
    )
    setBusy(false)
    if (res.ok) {
      setUrl(res.data.url)
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 3000)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  async function onRemove() {
    if (!window.confirm('清空默认头像?清空后,没头像的用户回到 mobile 端 hardcode 默认 SVG。'))
      return
    setBusy(true)
    setErrorMsg(null)
    const res = await adminFetch<{ url: string | null }>(
      '/v1/admin/settings/user-default-avatar',
      { method: 'DELETE' },
    )
    setBusy(false)
    if (res.ok) {
      setUrl(null)
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 3000)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          用户默认头像
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          没设头像的用户,mobile 端会显示这张图。不设置就回到 hardcode 的默认 SVG。
        </p>

        <div className="flex items-center gap-4">
          {loading ? (
            <div className="h-20 w-20 rounded-full bg-muted animate-pulse" />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="默认头像"
              className="h-20 w-20 rounded-full object-cover border"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground border">
              未设置
            </div>
          )}

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onFileChosen}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || loading}
                onClick={() => fileInputRef.current?.click()}
              >
                {url ? '替换' : '上传'}
              </Button>
              {url && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={onRemove}
                >
                  清空
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              上限 1MB,建议 256×256 jpeg/png
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {errorMsg}
          </div>
        )}
        {savedAt && (
          <div className="text-sm text-green-600 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> 已更新
          </div>
        )}
      </CardContent>
    </Card>
  )
}
