<script setup lang="ts">
// 老白头像统一组件(spec-022)
//
// 设计目标:看了让人产生信任感的兄长形象 — 戴细框眼镜、温和微笑、克制不油滑
// 替代之前散落 4 处的不同实现(LaokeBubble.vue / welcome.vue / profile.vue / splash.vue)
//
// v2 升级要点(对比 v1 戴眼镜简笔):
// - 加眉毛(温和弧线,不挑眉)
// - 嘴角微弯(暗示微笑但克制)
// - 加耳朵增加可识别性
// - 头发更自然(两缕,稍微凌乱)
// - 毛衣领口(温度感、不商务)
// - 描边粗细分级(脸 1.4 / 五官 1.0-1.2,层次更清楚)
//
// 配色用 design tokens 自动适配亮/暗主题
//
// 真"照片级"头像(M2 / 上线品牌升级时):
//   用 Midjourney / DALL-E 出 1024x1024 PNG → 上传 Supabase 公开 bucket
//   把这里 <svg> 替换成 <image :src="..." />
//   prompt 参考:
//   "a warm portrait illustration of a 32-year-old asian man with thin glasses,
//   slight smile, gentle expression, soft brown sweater, warm cream background,
//   editorial illustration style, minimal, half body, trustworthy elder brother feel"

interface Props {
  /** 尺寸,单位 rpx(默认 64,微信头像同款 + 给 SVG 留够呼吸感)*/
  size?: number
  /** 是否带浅紫底圆背景(对话气泡里需要 / splash 等已有自己的背景就关掉)*/
  withBackground?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 64,
  withBackground: true,
})
</script>

<template>
  <view
    class="laoke-avatar"
    :class="{ 'with-bg': withBackground }"
    :style="{ width: `${props.size}rpx`, height: `${props.size}rpx` }"
  >
    <!--
      老白 v2 — 戴眼镜兄长简笔
      24x24 viewBox,所有坐标按这个比例。SVG 自动随父容器尺寸缩放
    -->
    <svg
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
</style>
