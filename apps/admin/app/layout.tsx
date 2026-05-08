import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '练爱 Admin',
  description: '练爱后台管理',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">{children}</body>
    </html>
  )
}
