// Admin Prompt 工程台路由(spec-013 模块 B)

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from '../../../middleware/admin-auth.js'
import { recordAdminAudit } from '../../../services/admin/admin-audit.js'
import {
  listPromptNames,
  listVersionsByName,
  getVersion,
  createVersion,
  deployVersion,
  rollbackToVersion,
  listDatasets,
  getDataset,
  createDataset,
  runEval,
  listEvalRuns,
  getEvalRun,
} from '../../../services/admin/admin-prompt.service.js'

const createVersionSchema = z.object({
  name: z.string().trim().min(1),
  content: z.string().min(1),
  notes: z.string().optional(),
})

const deployBodySchema = z.object({
  rollout_pct: z.number().int().min(1).max(100).default(100),
  reason: z.string().trim().min(1),
})

const rollbackBodySchema = z.object({
  reason: z.string().trim().min(1),
})

const createDatasetSchema = z.object({
  name: z.string().trim().min(1),
  prompt_name: z.string().trim().optional(),
  description: z.string().optional(),
  samples: z
    .array(
      z.object({
        input: z.record(z.unknown()),
        expected_pattern: z.string().optional(),
        weight: z.number().optional(),
      }),
    )
    .min(1)
    .max(50),
})

const runEvalSchema = z.object({
  dataset_id: z.string().min(1),
  judge_model: z.string().optional(),
})

export async function adminPromptRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin)

  // === Prompt 版本 ===

  // GET /v1/admin/prompts — 所有 prompt name 概览
  app.get('/v1/admin/prompts', async () => {
    const names = await listPromptNames()
    return { ok: true, data: { names } }
  })

  // GET /v1/admin/prompts/by-name/:name — 某 name 的所有版本
  app.get<{ Params: { name: string } }>('/v1/admin/prompts/by-name/:name', async (request) => {
    const versions = await listVersionsByName(request.params.name)
    return { ok: true, data: { versions } }
  })

  // GET /v1/admin/prompts/versions/:versionId — 单版本详情(含 content)
  app.get<{ Params: { versionId: string } }>(
    '/v1/admin/prompts/versions/:versionId',
    async (request) => {
      const v = await getVersion(request.params.versionId)
      void recordAdminAudit(
        request.admin!.id,
        { action: 'view_prompt_version', target_type: 'prompt_version', target_id: v.id },
        request,
      )
      return { ok: true, data: v }
    },
  )

  // POST /v1/admin/prompts/versions — 创建新版本(staging)
  app.post('/v1/admin/prompts/versions', async (request) => {
    const body = createVersionSchema.parse(request.body)
    const v = await createVersion({
      ...body,
      author: request.admin!.id,
    })
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'create_prompt_version',
        target_type: 'prompt_version',
        target_id: v.id,
        after: { name: v.name, version: v.version },
      },
      request,
    )
    return { ok: true, data: v }
  })

  // POST /v1/admin/prompts/versions/:versionId/deploy — 部署
  app.post<{ Params: { versionId: string } }>(
    '/v1/admin/prompts/versions/:versionId/deploy',
    async (request) => {
      const body = deployBodySchema.parse(request.body)
      const v = await deployVersion(request.params.versionId, body.rollout_pct)
      await recordAdminAudit(
        request.admin!.id,
        {
          action: 'deploy_prompt_version',
          target_type: 'prompt_version',
          target_id: request.params.versionId,
          after: { rollout_pct: body.rollout_pct },
          reason: body.reason,
        },
        request,
      )
      return { ok: true, data: v }
    },
  )

  // POST /v1/admin/prompts/versions/:versionId/rollback — 回滚到此版本(创建新版 + 部署)
  app.post<{ Params: { versionId: string } }>(
    '/v1/admin/prompts/versions/:versionId/rollback',
    async (request) => {
      const body = rollbackBodySchema.parse(request.body)
      const v = await rollbackToVersion(request.params.versionId, request.admin!.id)
      await recordAdminAudit(
        request.admin!.id,
        {
          action: 'rollback_prompt_version',
          target_type: 'prompt_version',
          target_id: request.params.versionId,
          reason: body.reason,
        },
        request,
      )
      return { ok: true, data: v }
    },
  )

  // === Eval 数据集 ===

  app.get('/v1/admin/prompts/eval-datasets', async () => {
    const datasets = await listDatasets()
    return { ok: true, data: { datasets } }
  })

  app.get<{ Params: { datasetId: string } }>(
    '/v1/admin/prompts/eval-datasets/:datasetId',
    async (request) => {
      const d = await getDataset(request.params.datasetId)
      return { ok: true, data: d }
    },
  )

  app.post('/v1/admin/prompts/eval-datasets', async (request) => {
    const body = createDatasetSchema.parse(request.body)
    const d = await createDataset(body)
    await recordAdminAudit(
      request.admin!.id,
      {
        action: 'create_eval_dataset',
        target_type: 'prompt_eval_dataset',
        target_id: d.id,
        after: { name: d.name, samples_count: body.samples.length },
      },
      request,
    )
    return { ok: true, data: d }
  })

  // === Eval 跑 + 历史 ===

  // POST /v1/admin/prompts/versions/:versionId/eval — 同步跑 eval(M2 改异步)
  app.post<{ Params: { versionId: string } }>(
    '/v1/admin/prompts/versions/:versionId/eval',
    async (request) => {
      const body = runEvalSchema.parse(request.body)
      const result = await runEval({
        prompt_version_id: request.params.versionId,
        dataset_id: body.dataset_id,
        ...(body.judge_model !== undefined ? { judge_model: body.judge_model } : {}),
      })
      await recordAdminAudit(
        request.admin!.id,
        {
          action: 'run_prompt_eval',
          target_type: 'prompt_eval',
          target_id: result.id,
          after: { score: result.score, passed: result.passed, total: result.total },
        },
        request,
      )
      return { ok: true, data: result }
    },
  )

  app.get<{ Params: { versionId: string } }>(
    '/v1/admin/prompts/versions/:versionId/eval-runs',
    async (request) => {
      const runs = await listEvalRuns(request.params.versionId)
      return { ok: true, data: { runs } }
    },
  )

  app.get<{ Params: { evalId: string } }>(
    '/v1/admin/prompts/eval-runs/:evalId',
    async (request) => {
      const r = await getEvalRun(request.params.evalId)
      return { ok: true, data: r }
    },
  )
}
