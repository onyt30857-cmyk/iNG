// 重置 admin 密码(spec-011 临时工具)
//
// 用法:pnpm --filter @lianai/api reset-admin-password <email>
// 行为:
//   - 提示输入新密码(隐藏输入,raw mode + * mask;不支持 raw 时退到普通 readline)
//   - 提示再输一次确认
//   - 两次一致 → scrypt hash 落 admin_users.password_hash
//   - 不打印新密码,Claude 看不到

import readline from 'node:readline'
import { prisma } from '../src/lib/prisma.js'
import { hashAdminPassword } from '../src/services/admin/admin-password.js'

/**
 * 隐藏输入模式 — set raw mode + 自己处理 backspace/echo *
 * 不支持 raw(非 TTY)时 fallback 到 readline.question(明文输入,本地 terminal 可见)
 */
function readSecret(prompt: string): Promise<string> {
  const stdin = process.stdin
  const stdout = process.stdout

  // 非 TTY(pipe/CI)→ fallback
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    const rl = readline.createInterface({ input: stdin, output: stdout })
    return new Promise((resolve) => {
      stdout.write(prompt + '(注意:这次输入会显示明文)\n> ')
      rl.question('', (ans) => {
        rl.close()
        resolve(ans)
      })
    })
  }

  return new Promise((resolve, reject) => {
    stdout.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let pw = ''
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        // 回车 / EOF → 完成
        if (ch === '\n' || ch === '\r' || ch === '') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.removeListener('data', onData)
          stdout.write('\n')
          resolve(pw)
          return
        }
        // Ctrl+C → 退出
        if (ch === '') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.removeListener('data', onData)
          stdout.write('\n')
          reject(new Error('用户取消'))
          return
        }
        // backspace
        if (ch === '' || ch === '\b') {
          if (pw.length > 0) {
            pw = pw.slice(0, -1)
            stdout.write('\b \b')
          }
          continue
        }
        // 普通字符
        pw += ch
        stdout.write('*')
      }
    }
    stdin.on('data', onData)
  })
}

async function main(): Promise<void> {
  const email = process.argv[2]
  if (!email || !email.includes('@')) {
    console.error('用法: pnpm reset-admin-password <email>')
    process.exit(1)
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } })
  if (!admin) {
    console.error(`✗ admin ${email} 不存在`)
    process.exit(1)
  }
  if (!admin.active) {
    console.error(`✗ admin ${email} 已停用,无法重置`)
    process.exit(1)
  }

  console.log(`重置 admin ${email}(id=${admin.id})的密码`)
  console.log('')

  const pw1 = await readSecret('新密码(至少 12 位):')
  if (pw1.length < 12) {
    console.error('✗ 密码至少 12 位')
    process.exit(1)
  }

  const pw2 = await readSecret('再输一次确认:    ')
  if (pw1 !== pw2) {
    console.error('✗ 两次输入不一致')
    process.exit(1)
  }

  const hash = await hashAdminPassword(pw1)
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { password_hash: hash },
  })

  console.log('')
  console.log(`✓ 密码已更新。立刻去 https://lianai-admin.vercel.app/login 用新密码登录。`)
  console.log(`  旧密码已失效。`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
