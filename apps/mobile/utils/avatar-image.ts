// 头像图片压缩 - dev 阶段直接存 data URL 到 relationship.avatar_url
// M2 接 OSS 后改成上传 → 拿到 https URL → 存 URL

const TARGET_SIZE = 256
const JPEG_QUALITY = 0.78

export async function compressImageToAvatarDataUrl(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl)
  const srcBlob = await res.blob()
  if (!srcBlob.type.startsWith('image/')) {
    throw new Error(`不是图片: ${srcBlob.type}`)
  }

  const objectUrl = URL.createObjectURL(srcBlob)
  let img: HTMLImageElement
  try {
    img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  // 居中裁方
  const side = Math.min(img.width, img.height)
  const sx = (img.width - side) / 2
  const sy = (img.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = TARGET_SIZE
  canvas.height = TARGET_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context 获取失败')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE)
  ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE)

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}
