// Phase 1 P1.3(2026-05-14)— 商品定价 service
// 见 lianai-phase1-spec-v2/03-SPEC-P1.3-PAYMENT-MOCK.md
//
// cache:5min 内存 cache,admin 改商品 → invalidate
// boot seed:Decision 2B,server.ts 启动时 upsert 4 个商品(update:{} 保留已有改动)

import type { BillingProduct, ProductType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { logger } from '../../lib/logger.js'

let productsCache: BillingProduct[] | null = null
let productsCacheExpireAt = 0
const CACHE_TTL_MS = 5 * 60_000

/**
 * 列出所有上架商品(用户端 GET /v1/billing/products 用)
 */
export async function getEnabledProducts(): Promise<BillingProduct[]> {
  if (productsCache && Date.now() < productsCacheExpireAt) {
    return productsCache
  }
  productsCache = await prisma.billingProduct.findMany({
    where: { enabled: true },
    orderBy: { sort_order: 'asc' },
  })
  productsCacheExpireAt = Date.now() + CACHE_TTL_MS
  return productsCache
}

/**
 * 按 product_type 拿单个商品(create-order / deliver 时用)
 */
export async function getProductByType(
  productType: ProductType,
): Promise<BillingProduct | null> {
  const products = await getEnabledProducts()
  return products.find((p) => p.product_type === productType) ?? null
}

export function invalidateProductsCache(): void {
  productsCache = null
  productsCacheExpireAt = 0
}

// boot 时 seed 的默认 4 个商品(Decision 2B)
// upsert update:{} 已存在不覆盖 → admin 改了价格不会被启动 seed 覆盖
const DEFAULT_PRODUCTS: Array<{
  id: string
  product_type: ProductType
  name: string
  description: string
  price: number
  credit_pack_size?: number
  duration_days?: number
  sort_order: number
}> = [
  {
    id: 'seed_product_subscription_yearly',
    product_type: 'SUBSCRIPTION_YEARLY',
    name: '年费 Pro',
    description: '一年内无限解读 / 无限关系 / 月度复盘 / 主动洞察',
    price: 299,
    duration_days: 365,
    sort_order: 10,
  },
  {
    id: 'seed_product_credit_pack_30',
    product_type: 'CREDIT_PACK_30',
    name: '30 积分',
    description: '够用 7-15 天',
    price: 19,
    credit_pack_size: 30,
    sort_order: 20,
  },
  {
    id: 'seed_product_credit_pack_100',
    product_type: 'CREDIT_PACK_100',
    name: '100 积分',
    description: '够用 1 个月',
    price: 49,
    credit_pack_size: 100,
    sort_order: 30,
  },
  {
    id: 'seed_product_credit_pack_300',
    product_type: 'CREDIT_PACK_300',
    name: '300 积分',
    description: '够用 3 个月',
    price: 99,
    credit_pack_size: 300,
    sort_order: 40,
  },
]

/**
 * server.ts boot 时调,upsert 4 个默认商品。
 * update:{} 已存在不覆盖 admin 改动。
 * 不阻塞启动,内部 try-catch swallow。
 */
export async function seedBillingProductsOnBoot(): Promise<void> {
  try {
    let created = 0
    for (const p of DEFAULT_PRODUCTS) {
      const existing = await prisma.billingProduct.findUnique({
        where: { product_type: p.product_type },
      })
      if (existing) continue
      await prisma.billingProduct.create({
        data: {
          id: p.id,
          product_type: p.product_type,
          name: p.name,
          description: p.description,
          price: p.price,
          ...(p.credit_pack_size !== undefined ? { credit_pack_size: p.credit_pack_size } : {}),
          ...(p.duration_days !== undefined ? { duration_days: p.duration_days } : {}),
          sort_order: p.sort_order,
        },
      })
      created++
    }
    logger.info(
      { event: 'billing_products.seed_on_boot', created, total: DEFAULT_PRODUCTS.length },
      'BillingProduct seed 完成',
    )
    invalidateProductsCache()
  } catch (e) {
    logger.error({ err: e, event: 'billing_products.seed_failed' }, 'BillingProduct seed 失败')
  }
}
