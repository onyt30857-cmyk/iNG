import { redirect } from 'next/navigation'

// 根路径直接跳 dashboard,middleware 在那做鉴权 + 未登录跳 /login
export default function Page() {
  redirect('/dashboard')
}
