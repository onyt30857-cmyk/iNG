// Admin 账户密码 hash + verify(spec-011)
//
// 跟用户端 backup-code.ts 一致用 scrypt(node:crypto 内置,无新依赖)
// + 同样的 N=2^14(再高就超 Node 默认 maxmem 32MB,需要专门 tune)
// 工业标准 N=2^14 r=8 p=1 已能扛多 GPU 暴破,admin 登录场景足够。
//
// 存储格式:scrypt$<salt-hex>$<hash-hex>
// 密码大小写敏感,不做 normalize。

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err)
      else resolve(derived)
    })
  })
}

const SCRYPT_N = 1 << 14 // ~50ms,跟 backup-code 同档,Node 默认内存上限内
const SCRYPT_R = 8
const SCRYPT_P = 1
const HASH_BYTES = 32
const SALT_BYTES = 16

const PASSWORD_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'

/** 生成随机临时密码(seed 用)— 16 位混合字符 */
export function generateTempPassword(length = 16): string {
  const bytes = randomBytes(length)
  const chars: string[] = []
  for (let i = 0; i < length; i++) {
    chars.push(PASSWORD_ALPHABET[bytes[i]! % PASSWORD_ALPHABET.length]!)
  }
  return chars.join('')
}

/** Hash admin 密码 — 返回 scrypt$<salt>$<hash> 格式串 */
export async function hashAdminPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('admin 密码至少 12 位')
  }
  const salt = randomBytes(SALT_BYTES)
  const hash = await scrypt(password, salt, HASH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** 验证密码,constant-time compare */
export async function verifyAdminPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1]!, 'hex')
  const expected = Buffer.from(parts[2]!, 'hex')
  const actual = await scrypt(password, salt, expected.length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
