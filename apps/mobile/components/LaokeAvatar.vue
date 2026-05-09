<script setup lang="ts">
// 老白头像统一组件(spec-022 + 2026-05-10 升级:接 admin 上传头像)
//
// 行为:
// - 默认从 useLaokeStore() 读 avatarUrl(admin 改头像后全 mobile 跟着变)
// - 父组件可通过 :url="..." 显式覆盖
// - 没有 url(内置默认 / 加载中 / fetch 失败)→ 渲染 SVG 兜底头像
//
// 设计目标:看了让人产生信任感的兄长形象 — 戴细框眼镜、温和微笑、克制不油滑

import { computed } from 'vue'
import { useLaokeStore } from '../stores/laoke'

interface Props {
  /** 尺寸,单位 rpx(默认 64,微信头像同款 + 给 SVG 留够呼吸感)*/
  size?: number
  /** 是否带浅紫底圆背景(对话气泡里需要 / splash 等已有自己的背景就关掉)*/
  withBackground?: boolean
  /** 显式 url(优先级高于 store);传空字符串/null 则强制走 SVG 默认 */
  url?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  size: 64,
  withBackground: true,
  url: undefined,
})

const laokeStore = useLaokeStore()

// url prop 显式传 → 用 prop;否则读 store。两者都为空 → SVG 兜底
const effectiveUrl = computed(() => {
  if (props.url !== undefined) return props.url
  return laokeStore.avatarUrl
})
</script>

<template>
  <view
    class="laoke-avatar"
    :class="{ 'with-bg': withBackground && !effectiveUrl }"
    :style="{ width: `${props.size}rpx`, height: `${props.size}rpx` }"
  >
    <!-- admin 上传头像 → 渲染图片(Supabase 公网 URL 或 data URL 都支持)-->
    <image
      v-if="effectiveUrl"
      :src="effectiveUrl"
      mode="aspectFill"
      class="laoke-avatar-img"
    />

    <!--
      老白 v2 — 戴眼镜兄长简笔(默认兜底 / 加载失败时显示)
      24x24 viewBox,所有坐标按这个比例。SVG 自动随父容器尺寸缩放
    -->
    <svg
      v-else
      :width="props.size * 0.78"
      :height="props.size * 0.78"
      viewBox="0 0 24 24"
      fill="none"
      class="laoke-avatar-svg"
    >
      <!-- 耳朵(左右) -->
      <path
        d="M5.4 13.5 c -0.6 0.2 -0.9 0.8 -0.7 1.4 c 0.15 0.45 0.55 0.7 1.0 0.6"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M18.6 13.5 c 0.6 0.2 0.9 0.8 0.7 1.4 c -0.15 0.45 -0.55 0.7 -1.0 0.6"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        fill="none"
      />

      <!-- 头脸(微方,显成熟,下巴留缺口做暖颈感) -->
      <path
        d="M5.5 12.5 a6.5 6.5 0 0 1 13 0 v3.5 a2.5 2.5 0 0 1 -2.5 2.5 h-8 a2.5 2.5 0 0 1 -2.5 -2.5 z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />

      <!-- 头发(两缕,自然不商务) -->
      <path
        d="M7 9.5 Q 9 6.5 12 7"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
      <path
        d="M12 7 Q 15 6.5 17 9.5"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />

      <!-- 眉毛(温和弧线,左右各一)-->
      <path
        d="M7.8 11 Q 9.4 10.4 10.8 11"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M13.2 11 Q 14.6 10.4 16.2 11"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        fill="none"
      />

      <!-- 眼镜(细框双圆 + 中桥) -->
      <circle cx="9.3" cy="13.2" r="1.5" stroke="currentColor" stroke-width="1.4" />
      <circle cx="14.7" cy="13.2" r="1.5" stroke="currentColor" stroke-width="1.4" />
      <line
        x1="10.8"
        y1="13.2"
        x2="13.2"
        y2="13.2"
        stroke="currentColor"
        stroke-width="1.2"
      />

      <!-- 嘴角微弯(浅笑,克制不油滑) -->
      <path
        d="M10.5 16.6 Q 12 17.2 13.5 16.6"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        fill="none"
      />

      <!-- 毛衣领口暗示(脖子下方一笔,温度感) -->
      <path
        d="M9.5 19.5 Q 12 21 14.5 19.5"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        fill="none"
        opacity="0.6"
      />
    </svg>
  </view>
</template>

<style lang="scss" scoped>
.laoke-avatar {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}
.laoke-avatar.with-bg {
  background-color: $color-laoke-subtle;
}
.laoke-avatar-svg {
  /* 头像 SVG 描边色:用 $color-laoke-deep(深紫,在浅紫底上读得清)*/
  color: $color-laoke-deep;
  display: block;
}
.laoke-avatar-img {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
