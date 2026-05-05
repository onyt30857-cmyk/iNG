// OCR 端点 zod 校验

import { z } from 'zod'

const imageItemSchema = z.object({
  /** base64 编码的图片(不含 data:image/... 前缀,只 base64 部分),单图最大 ~5MB */
  base64: z.string().min(100, 'base64 数据过短').max(8 * 1024 * 1024, '单图过大,需先压缩'),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
})

export const runOcrSchema = z.object({
  relationship_id: z.string().min(1, 'relationship_id 必填'),
  images: z.array(imageItemSchema).min(1, '至少 1 张').max(5, '最多 5 张'),
})
