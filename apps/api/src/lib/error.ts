// 统一错误类型
// CLAUDE.md §3 要求: 所有错误通过自定义 AppError 抛出,含 code, message, statusCode

/**
 * 错误码列表
 * 命名规则: 大类_具体场景 (SCREAMING_SNAKE_CASE)
 * 新增错误码必须同步到 02-architecture/api-design.md
 */
export const ErrorCodes = {
  // 通用
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',

  // 鉴权
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // 关系隔离(CLAUDE.md §5.1 三层防御)
  RELATIONSHIP_ACCESS_DENIED: 'RELATIONSHIP_ACCESS_DENIED',
  RELATIONSHIP_NOT_FOUND: 'RELATIONSHIP_NOT_FOUND',

  // 微信
  WECHAT_AUTH_FAILED: 'WECHAT_AUTH_FAILED',
  WECHAT_NOT_CONFIGURED: 'WECHAT_NOT_CONFIGURED',

  // AI 服务
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_CONTENT_BLOCKED: 'AI_CONTENT_BLOCKED',

  // 红线(CLAUDE.md §6)
  RED_LINE_TRIGGERED: 'RED_LINE_TRIGGERED',

  // 内容审核
  CONTENT_VIOLATION: 'CONTENT_VIOLATION',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/**
 * 项目统一错误类型
 *
 * 用户可见的错误信息必须友好(CLAUDE.md §9 文案规范),
 * 不要写 "操作失败" "请重试" 这种机器感文案。
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly detail: string | undefined

  constructor(params: {
    code: ErrorCode
    message: string
    statusCode?: number
    detail?: string
  }) {
    super(params.message)
    this.name = 'AppError'
    this.code = params.code
    this.statusCode = params.statusCode ?? 500
    this.detail = params.detail
  }
}

// 常用快捷构造器,减少样板代码
export const errors = {
  notFound: (message = '没找到这个东西') =>
    new AppError({ code: ErrorCodes.NOT_FOUND, message, statusCode: 404 }),

  authRequired: () =>
    new AppError({
      code: ErrorCodes.AUTH_REQUIRED,
      message: '先登录吧',
      statusCode: 401,
    }),

  authFailed: (detail?: string) =>
    new AppError({
      code: ErrorCodes.AUTH_FAILED,
      message: '登录失效,重新登录一下',
      statusCode: 401,
      detail,
    }),

  permissionDenied: (message = '这事你没权限') =>
    new AppError({ code: ErrorCodes.PERMISSION_DENIED, message, statusCode: 403 }),

  validation: (message: string, detail?: string) =>
    new AppError({
      code: ErrorCodes.VALIDATION_ERROR,
      message,
      statusCode: 400,
      detail,
    }),

  internal: (detail?: string) =>
    new AppError({
      code: ErrorCodes.INTERNAL_ERROR,
      message: '我这边出了点问题,等会儿再试',
      statusCode: 500,
      detail,
    }),
}
