<script setup lang="ts">
// 关系头像 - 用 name hash 出对角渐变 + 首字母
import { computed } from 'vue'

interface Props {
  name: string
  seed?: string | null
  /** 用户上传的头像 URL(可以是 https URL 或 data URL),优先于渐变首字 */
  url?: string | null
  size?: number  // px
}
const props = withDefaults(defineProps<Props>(), {
  seed: null,
  url: null,
  size: 48,
})

// 4 个 token 色(墨青蓝/茶棕/林木绿/天空蓝),hash 选 2 个做对角渐变
const PALETTE = [
  '#4B5577', // 墨青蓝 soft
  '#A87C5F', // 茶棕
  '#5A8A6F', // 林木绿
  '#3D6B8C', // 天空蓝
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const seedKey = computed(() => props.seed ?? props.name)
const colors = computed(() => {
  const h = hash(seedKey.value)
  const a = h % PALETTE.length
  // 第二色避开同一色
  const b = (a + 1 + (h >> 4) % (PALETTE.length - 1)) % PALETTE.length
  return { from: PALETTE[a], to: PALETTE[b] }
})

// 首字母:中文取首字,英文取首两字大写
const initial = computed(() => {
  const n = props.name.trim()
  if (!n) return '?'
  // 是否中文
  if (/^[一-鿿]/.test(n)) return n.charAt(0)
  return n.slice(0, 2).toUpperCase()
})

const fontSize = computed(() => Math.round(props.size * 0.42))
</script>

<template>
  <view
    class="avatar"
    :style="{
      width: size + 'px',
      height: size + 'px',
      background: url ? 'transparent' : `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
    }"
  >
    <image v-if="url" class="avatar-img" :src="url" mode="aspectFill" />
    <text v-else class="initial" :style="{ fontSize: fontSize + 'px' }">{{ initial }}</text>
  </view>
</template>

<style lang="scss" scoped>
.avatar {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.avatar-img {
  width: 100%;
  height: 100%;
  display: block;
}
.initial {
  color: #ffffff;
  font-weight: $weight-semibold;
  letter-spacing: -1rpx;
  text-shadow: 0 1rpx 2rpx rgba(0, 0, 0, 0.15);
}
</style>
