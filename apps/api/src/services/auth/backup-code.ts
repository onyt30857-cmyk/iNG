// 匿名账户备份码 — 生成 + scrypt hash + verify
//
// 格式:12 个字符,大写字母 + 数字(去掉易混 O/0/I/1/L)
// 分组:XXXX-XXXX-XXXX(4-4-4 给用户更好读)
// entropy:每字符 log2(31) ≈ 4.95 bits × 12 = 59 bits(约 5.7 × 10^17 种,够用)
//
// hash:scrypt N=2^14 r=8 p=1(交互式登录场景标准参数,~50ms)
// 存格式:scrypt$<salt-hex>$<hash-hex>

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

// promisify 的类型不兼容 scrypt 的 options 重载,手动 wrap
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

// 去掉视觉易混淆字符:O 0 I 1 L
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const SCRYPT_N = 1 << 14
const SCRYPT_R = 8
const SCRYPT_P = 1
const HASH_BYTES = 32
const SALT_BYTES = 16

/** 生成新备份码,返回明文(给用户看 + 必须立刻让用户保存,db 只存 hash) */
export function generateBackupCode(): string {
  const bytes = randomBytes(12)
  const chars: string[] = []
  for (let i = 0; i < 12; i++) {
    chars.push(ALPHABET[bytes[i]! % ALPHABET.length]!)
  }
  // 4-4-4 分组
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

/** 把用户输入的备份码标准化(允许小写/空格/无连字符):*/
export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** scrypt hash 格式:scrypt$<salt-hex>$<hash-hex> */
export async function hashBackupCode(code: string): Promise<string> {
  const normalized = normalizeBackupCode(code)
  const salt = randomBytes(SALT_BYTES)
  const hash = await scrypt(normalized, salt, HASH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** 验证用户输入的备份码,constant-time compare 防 timing 攻击 */
export async function verifyBackupCode(
  code: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1]!, 'hex')
  const expected = Buffer.from(parts[2]!, 'hex')
  const normalized = normalizeBackupCode(code)
  const actual = await scrypt(normalized, salt, expected.length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
