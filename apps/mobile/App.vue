<script setup lang="ts">
// 全局生命周期 —— uni-app 项目根组件
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from './stores/user'

onLaunch(async () => {
  // 启动时从 storage 恢复 token,如果没有就匿名注册(spec-002 v2,无手机/邮箱/微信)
  const userStore = useUserStore()
  userStore.init()
  if (!userStore.isLoggedIn()) {
    await userStore.ensureSession()
    console.log('[App] anonymous registered, user_id=', userStore.userId)
  } else {
    console.log('[App] launch, restored user_id=', userStore.userId)
  }

  // spec-018 全局 onboarding 守卫:未走完 onboarding 强制跳 welcome
  // 必须在 App 级,因为 uni-app H5 的 hash URL 可能直接跳到任意页(如 #/pages/home/index)
  // 绕过 splash 的检查。这里是最后一道防线。
  // 例外:已经在 onboarding 流程内(welcome / profile)不跳,避免 reLaunch 自己。
  if (!userStore.isOnboarded()) {
    const pages = getCurrentPages()
    const currentRoute = pages[pages.length - 1]?.route ?? ''
    const inOnboarding = currentRoute.startsWith('pages/onboarding/')
    const inSplash = currentRoute === 'pages/splash/index'
    if (!inOnboarding && !inSplash) {
      console.log('[App] onboarding 未完成,强制跳 welcome (from:', currentRoute, ')')
      uni.reLaunch({ url: '/pages/onboarding/welcome' })
    }
  }
})

onShow(() => {
  console.log('[App] show')
})

onHide(async () => {
  console.log('[App] hide')
  // spec-013 模块 D 行为埋点:用户离开 App(后台/切换),作为"5 分钟离开率"信号
  // flushNow 强制把队列里没发的事件立刻发出
  const { reportBehavior, flushNow } = await import('./utils/behavior-tracker')
  reportBehavior('user_left_app')
  void flushNow()
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
