<script setup lang="ts">
// 全局生命周期 —— uni-app 项目根组件
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from './stores/user'
import { useLaokeStore } from './stores/laoke'
import { BASE_URL } from './api/client'

// 2026-05-10 P1 监控:全局未捕获错误 → 上报后端 /v1/client-errors
// 让 admin 能看到框架级 / vendor bundle / SSE 等绕过 client.ts 的失败
function installGlobalErrorReporter(): void {
  if (typeof window === 'undefined') return // 原生环境不开
  const send = (payload: { code: string; message: string; detail?: string }) => {
    try {
      uni.request({
        url: `${BASE_URL}/client-errors`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: {
          path: window.location?.pathname ?? '/',
          method: 'CLIENT',
          code: payload.code,
          message: payload.message.slice(0, 500),
          detail: (payload.detail ?? '').slice(0, 2000),
          ua: navigator?.userAgent,
          url: window.location?.href ?? null,
        },
        timeout: 5_000,
      })
    } catch {
      /* 上报失败也不能炸 */
    }
  }
  window.addEventListener('error', (e) => {
    send({
      code: 'GLOBAL_ERROR',
      message: e.message ?? String(e.error ?? 'unknown error'),
      detail: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`,
    })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    send({
      code: 'UNHANDLED_REJECTION',
      message: reason instanceof Error ? reason.message : String(reason),
      detail: reason instanceof Error ? reason.stack : undefined,
    })
  })
}

onLaunch(async () => {
  // P1 监控:第一时间装全局错误上报,后续 init 报错也能捕获
  installGlobalErrorReporter()

  // 启动时从 storage 恢复 token,如果没有就匿名注册(spec-002 v2,无手机/邮箱/微信)
  const userStore = useUserStore()
  userStore.init()
  if (!userStore.isLoggedIn()) {
    await userStore.ensureSession()
    console.log('[App] anonymous registered, user_id=', userStore.userId)
  } else {
    console.log('[App] launch, restored user_id=', userStore.userId)
  }

  // 2026-05-10 修需求 1:从服务器同步最新 user 覆盖本地缓存
  // 必须在 onboarding 守卫(下方 isOnboarded 判断)之前完成,否则可能拿陈旧
  // 的 onboarding_completed_at 错把已 onboarded 用户送回 welcome
  // 失败静默(网络问题不阻塞冷启动,fallback 用本地缓存)
  await userStore.syncFromServer()

  // 拉老白 profile(头像 / 身份介绍),admin 改了立即生效
  // 先 init 用 storage 缓存避免冷启动闪默认,再异步 fetch 拿最新
  const laokeStore = useLaokeStore()
  laokeStore.init()
  void laokeStore.fetch()

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
