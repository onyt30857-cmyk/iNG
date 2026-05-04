<script setup lang="ts">
// 全局生命周期 —— uni-app 项目根组件
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from './stores/user'

onLaunch(() => {
  // 启动时从 storage 恢复登录态(spec-002)
  const userStore = useUserStore()
  userStore.init()
  console.log('[App] launch, isLoggedIn=', userStore.isLoggedIn())
})

onShow(() => {
  console.log('[App] show')
})

onHide(() => {
  console.log('[App] hide')
})
</script>

<style lang="scss">
// 全局样式 —— 注意 uni-app 的页面默认就有 padding,不要在这里乱加 reset

page {
  background-color: $color-background;
  color: $color-text-primary;
  font-family: $font-family-zh;
  font-size: $font-body;
  line-height: 1.6;
}
</style>
