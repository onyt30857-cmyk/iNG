// 客户端图片压缩 - canvas resize + JPEG 重编码
//
// 真实手机照片(iPhone 12MP)单张 base64 后常超 5MB,Anthropic SDK 拒收。
// 压缩到长边 ≤ 2000px + JPEG quality 85%,既保留聊天文字清晰度,又把单图压到 ~300-600KB。
//
// 只在 H5 模式可用(依赖浏览器 Image / canvas / FileReader API)。
// 原生 App 模式后续用 uni-app 的 uni.compressImage(M2)。

import type { OcrInputImage, OcrMediaType } from '../api/conversation.api'

const MAX_LONG_SIDE = 2000
const JPEG_QUALITY = 0.85

/**
 * 把 blob URL(uni.chooseImage 返回的 tempFilePath)压缩并转 base64。
 * 输出统一为 image/jpeg(便于后端处理),即使输入是 png/webp 也会被转 jpeg。
 */
export async function compressImageFromBlobUrl(
  blobUrl: string,
): Promise<OcrInputImage> {
  // 1. 拉 blob
  const res = await fetch(blobUrl)
  const srcBlob = await res.blob()
  if (!srcBlob.type.startsWith('image/')) {
    throw new Error(`不是图片: ${srcBlob.type}`)
  }

  // 2. 加载到 Image 元素
  const objectUrl = URL.createObjectURL(srcBlob)
  let img: HTMLImageElement
  try {
    img = await loadImage(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  // 3. 计算 resize 尺寸(长边 ≤ MAX_LONG_SIDE)
  const longSide = Math.max(img.width, img.height)
  const scale = longSide > MAX_LONG_SIDE ? MAX_LONG_SIDE / longSide : 1
  const targetW = Math.round(img.width * scale)
  const targetH = Math.round(img.height * scale)

  // 4. canvas drawImage
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context 获取失败')
  // 白底兜底(防止 png 透明区域变黑)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, targetW, targetH)
  ctx.drawImage(img, 0, 0, targetW, targetH)

  // 5. 输出 JPEG base64
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!m) throw new Error('canvas.toDataURL 输出无效')

  return {
    mediaType: m[1] as OcrMediaType,
    base64: m[2]!,
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('图片加载失败'))
    i.src = src
  })
}
