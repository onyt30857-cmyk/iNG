'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag, CheckCircle2, Save, AlertCircle } from 'lucide-react'
import { adminFetch, adminGet } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BillingProduct {
  id: string
  product_type:
    | 'SUBSCRIPTION_YEARLY'
    | 'CREDIT_PACK_30'
    | 'CREDIT_PACK_100'
    | 'CREDIT_PACK_300'
  name: string
  description: string
  price: string // Decimal as string from API
  original_price: string | null
  credit_pack_size: number | null
  duration_days: number | null
  enabled: boolean
  sort_order: number
  admin_note: string | null
  updated_by: string | null
  updated_at: string
}

const TYPE_LABEL: Record<BillingProduct['product_type'], string> = {
  SUBSCRIPTION_YEARLY: '🌟 年费 Pro',
  CREDIT_PACK_30: '🪙 30 积分包',
  CREDIT_PACK_100: '🪙 100 积分包',
  CREDIT_PACK_300: '🪙 300 积分包',
}

export default function BillingProductsPage() {
  const [products, setProducts] = useState<BillingProduct[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await adminGet<BillingProduct[]>('/v1/admin/billing/products')
    setLoading(false)
    if (res.ok) {
      setProducts(res.data)
    } else {
      setErrorMsg(res.error.message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" /> 商品定价
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          年费 + 积分包定价,改完 5 分钟内全后端读到新值。Mobile App 端 GET /v1/billing/products 拿这里的内容。
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive" />
          {errorMsg}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!loading && products && (
        <div className="space-y-4">
          {products.map((p) => (
            <ProductEditor
              key={p.id}
              product={p}
              onSaved={(updated) => {
                setProducts((prev) =>
                  prev ? prev.map((x) => (x.id === updated.id ? updated : x)) : prev,
                )
                setSavedId(updated.id)
                setTimeout(() => setSavedId(null), 3000)
              }}
              showSaved={savedId === p.id}
              onError={(msg) => setErrorMsg(msg)}
            />
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-5 text-xs text-muted-foreground space-y-1">
          <p>📌 价格用 ¥ 元为单位,小数点后两位</p>
          <p>📌 关闭"上架"= mobile 商品列表看不到,但已购订阅 / 已充积分不受影响</p>
          <p>📌 sort_order 越小越靠前(年费一般 10,积分包 20/30/40)</p>
          <p>📌 改动 5 分钟内全部 server 读到(后端 cache TTL = 5 min)</p>
        </CardContent>
      </Card>
    </div>
  )
}

function ProductEditor({
  product,
  onSaved,
  showSaved,
  onError,
}: {
  product: BillingProduct
  onSaved: (updated: BillingProduct) => void
  showSaved: boolean
  onError: (msg: string) => void
}) {
  const [name, setName] = useState(product.name)
  const [description, setDescription] = useState(product.description)
  const [price, setPrice] = useState(Number(product.price))
  const [enabled, setEnabled] = useState(product.enabled)
  const [sortOrder, setSortOrder] = useState(product.sort_order)
  const [adminNote, setAdminNote] = useState(product.admin_note ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await adminFetch<BillingProduct>(
      `/v1/admin/billing/products/${product.id}`,
      {
        method: 'PATCH', // adminFetch 用 PATCH;后端 PUT 也支持
        body: {
          name,
          description,
          price,
          enabled,
          sort_order: sortOrder,
          admin_note: adminNote || undefined,
        },
      },
    )
    setSaving(false)
    if (res.ok) {
      onSaved(res.data)
    } else {
      onError(res.error.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{TYPE_LABEL[product.product_type]}</span>
          {showSaved && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 font-normal">
              <CheckCircle2 className="h-3.5 w-3.5" /> 已保存
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${product.id}`}>名称</Label>
            <Input
              id={`name-${product.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`price-${product.id}`}>价格(¥)</Label>
            <Input
              id={`price-${product.id}`}
              type="number"
              step="0.01"
              min={0}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`desc-${product.id}`}>说明文案</Label>
          <Input
            id={`desc-${product.id}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* readonly 信息 */}
        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
          {product.credit_pack_size && (
            <div>积分数量:{product.credit_pack_size}</div>
          )}
          {product.duration_days && (
            <div>订阅天数:{product.duration_days}</div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`sort-${product.id}`}>排序(越小越靠前)</Label>
            <Input
              id={`sort-${product.id}`}
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span className="text-sm">上架(用户能看到)</span>
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`note-${product.id}`}>内部备注(用户看不到)</Label>
          <Input
            id={`note-${product.id}`}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="例:M1 试运营优惠价 ¥199"
          />
        </div>

        <div className="flex justify-between items-center pt-2">
          <span className="text-xs text-muted-foreground">
            {product.updated_at && `上次改:${new Date(product.updated_at).toLocaleString('zh-CN')}`}
            {product.updated_by && ` · ${product.updated_by.slice(0, 8)}`}
          </span>
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-3.5 w-3.5 mr-1" />
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
