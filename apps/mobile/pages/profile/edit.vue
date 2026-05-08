<script setup lang="ts">
// 编辑昵称头像(spec-018,onboarding 完成后再来改也走这页)
import { ref, computed } from 'vue'
import { useUserStore } from '../../stores/user'
import { updateProfile } from '../../api/user.api'
import { PRESET_AVATARS } from '../../utils/preset-avatars'

const userStore = useUserStore()

const nickname = ref(userStore.user?.nickname ?? '')
const selectedAvatar = ref<string | null>(userStore.user?.avatar_url ?? null)
const saving = ref(false)
const errorMsg = ref<string | null>(null)

const nicknameLength = computed(() => nickname.value.trim().length)
const nicknameValid = computed(
  () => nicknameLength.value >= 2 && nicknameLength.value <= 12,
)

function selectAvatar(url: string) {
  selectedAvatar.value = url
}

function clearAvatar() {
  selectedAvatar.value = null
}

async function save() {
  if (!nicknameValid.value) {
    errorMsg.value = nicknameLength.value < 2 ? '至少 2 个字' : '最多 12 个字'
    return
  }
  if (saving.value) return
  saving.value = true
  errorMsg.value = null
  const res = await updateProfile({
    nickname: nickname.value.trim(),
    avatar_url: selectedAvatar.value,
  })
  saving.value = false
  if (!res.ok) {
    errorMsg.value = res.error.message
    return
  }
  if (userStore.user) {
    userStore.setUser({
      ...userStore.user,
      nickname: res.data.nickname,
      avatar_url: res.data.avatar_url,
      onboarding_completed_at: res.data.onboarding_completed_at,
    })
  }
  uni.showToast({ title: '已保存', icon: 'success' })
  setTimeout(() => uni.navigateBack(), 600)
}
</script>

<template>
  <view class="page">
    <view class="section">
      <text class="label">昵称</text>
      <input
        class="input"
        :class="{ error: errorMsg && !nicknameValid }"
        v-model="nickname"
        placeholder="2-12 字"
        maxlength="12"
        @input="errorMsg = null"
      />
      <text v-if="errorMsg" class="helper helper-error">{{ errorMsg }}</text>
      <text v-else class="helper">{{ nicknameLength }} / 12</text>
    </view>

    <view class="section">
      <view class="label-row">
        <text class="label">头像</text>
        <text v-if="selectedAvatar" class="clear-link" @tap="clearAvatar">不要头像</text>
      </view>
      <view class="avatar-grid">
        <view
          v-for="url in PRESET_AVATARS"
          :key="url"
          class="avatar-item"
          :class="{ selected: selectedAvatar === url }"
          @tap="selectAvatar(url)"
        >
          <image :src="url" mode="aspectFill" class="avatar-img" />
        </view>
      </view>
    </view>

    <view class="footer">
      <button class="btn-primary" :disabled="saving || !nicknameValid" @click="save">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: $color-background;
  padding: $space-4 $space-4 $space-12;
}
.section {
  background: $color-surface;
  border-radius: $radius-md;
  padding: $space-3;
  margin-bottom: $space-3;
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.label {
  font-size: $font-body-small;
  color: $color-text-secondary;
  font-weight: $weight-medium;
}
.clear-link {
  font-size: $font-footnote;
  color: $color-text-tertiary;
  text-decoration: underline;
}
.input {
  margin-top: $space-2;
  width: 100%;
  height: 80rpx;
  padding: 0 $space-3;
  background: $color-surface-subtle;
  border: 1rpx solid $color-border;
  border-radius: $radius-md;
  font-size: $font-body;
  color: $color-text-primary;
}
.input.error { border-color: $color-danger; }
.helper {
  display: block;
  margin-top: $space-1;
  font-size: 22rpx;
  color: $color-text-tertiary;
  text-align: right;
}
.helper-error {
  color: $color-danger;
  text-align: left;
  font-weight: $weight-medium;
}
.avatar-grid {
  margin-top: $space-3;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $space-2;
}
.avatar-item {
  aspect-ratio: 1;
  background: $color-surface-subtle;
  border: 3rpx solid $color-border;
  border-radius: 50%;
  position: relative;
  overflow: hidden;
}
.avatar-img { width: 100%; height: 100%; }
.avatar-item.selected {
  border-color: $color-accent;
  border-width: 4rpx;
  transform: scale(1.06);
}
.footer {
  margin-top: $space-4;
}
.btn-primary {
  width: 100%;
  height: 96rpx;
  border-radius: $radius-md;
  background: $color-primary;
  color: #fff;
  font-size: $font-body;
  font-weight: $weight-medium;
  border: none;
}
.btn-primary[disabled] {
  background: $color-primary-soft;
  color: #fff;
}
</style>
