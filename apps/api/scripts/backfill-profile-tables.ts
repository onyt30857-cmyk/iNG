// spec-m2-000 任务 4:历史数据回填脚本
//
// 把 Relationship.basic_facts.key_facts / pending_facts 迁移到独立表
//   key_facts → ProfileAssertion(confidence=0.85, priority=70)
//   pending_facts → RelationshipObservation(type='backfill_low_confidence', confidence=0.5)
//
// 不删除 basic_facts.key_facts / pending_facts(保留作冷备,M3 验证完整性后才清理)
// 在 basic_facts 加 _migrated_to_independent_tables: <ISO ts> 防重跑
//
// 用法:
//   pnpm --filter @lianai/api backfill-profile-tables           # dry-run(默认,不写数据)
//   pnpm --filter @lianai/api backfill-profile-tables --for-real # 真跑
//
// 安全:
// - 默认 dry-run,要 Sam 看完输出确认后才 --for-real
// - 幂等:每个 relationship 跑前查 _migrated_to_independent_tables,已迁移跳过
// - 每 relationship 一个 prisma.$transaction,失败跳过该条不影响其他
// - 进度日志每 50 条打印一次

import { prisma } from '../src/lib/prisma.js'

interface PendingFact {
  text: string
  evidence_quote?: string
  kind?: string
  captured_at?: string
}

const FOR_REAL = process.argv.includes('--for-real')
const MODE = FOR_REAL ? 'FOR_REAL' : 'DRY_RUN'

async function main(): Promise<void> {
  console.log(`\n=== backfill-profile-tables [${MODE}] ===\n`)

  const relationships = await prisma.relationship.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      user_id: true,
      name: true,
      basic_facts: true,
    },
  })

  console.log(`扫描 relationships: ${relationships.length} 条`)

  let stats = {
    skipped_already_migrated: 0,
    skipped_no_facts: 0,
    will_migrate: 0,
    assertions_to_insert: 0,
    observations_to_insert: 0,
    transaction_failures: 0,
  }

  const previewSamples: Array<{
    id: string
    name: string
    keyFactsCount: number
    pendingFactsCount: number
  }> = []

  let processed = 0
  for (const rel of relationships) {
    processed++

    const bf = (rel.basic_facts as Record<string, unknown> | null) ?? {}

    // 已迁移跳过
    if (bf._migrated_to_independent_tables != null) {
      stats.skipped_already_migrated++
      continue
    }

    const keyFacts = (bf.key_facts as string[] | undefined) ?? []
    const pendingFacts = (bf.pending_facts as PendingFact[] | undefined) ?? []

    if (keyFacts.length === 0 && pendingFacts.length === 0) {
      stats.skipped_no_facts++
      continue
    }

    stats.will_migrate++
    stats.assertions_to_insert += keyFacts.length
    stats.observations_to_insert += pendingFacts.length

    if (previewSamples.length < 5) {
      previewSamples.push({
        id: rel.id,
        name: rel.name,
        keyFactsCount: keyFacts.length,
        pendingFactsCount: pendingFacts.length,
      })
    }

    // FOR_REAL 模式真写入
    if (FOR_REAL) {
      try {
        await prisma.$transaction([
          ...keyFacts.map((text) =>
            prisma.profileAssertion.create({
              data: {
                relationship_id: rel.id,
                assertion_text: text,
                confidence: 0.85,
                priority: 70, // 略高于实时抽取的 50,体现"历史已确认"
                source_observation_ids: [],
              },
            }),
          ),
          ...pendingFacts.map((p) =>
            prisma.relationshipObservation.create({
              data: {
                relationship_id: rel.id,
                observation_text: p.text,
                observation_type: 'backfill_low_confidence',
                confidence: 0.5,
                source_message_ids: [],
              },
            }),
          ),
          // 加迁移标记
          prisma.relationship.update({
            where: { id: rel.id },
            data: {
              basic_facts: {
                ...bf,
                _migrated_to_independent_tables: new Date().toISOString(),
              } as Record<string, unknown>,
            },
          }),
        ])
      } catch (e) {
        stats.transaction_failures++
        console.warn(`  [FAIL] rel ${rel.id} (${rel.name}):`, (e as Error).message)
      }
    }

    if (processed % 50 === 0) {
      console.log(`  进度: ${processed} / ${relationships.length}`)
    }
  }

  console.log('')
  console.log(`=== 统计 [${MODE}] ===`)
  console.log(`已扫描:                ${relationships.length}`)
  console.log(`已迁移(skip):          ${stats.skipped_already_migrated}`)
  console.log(`无 facts(skip):        ${stats.skipped_no_facts}`)
  console.log(`待迁移:                ${stats.will_migrate}`)
  console.log(`将插入 ProfileAssertion:    ${stats.assertions_to_insert}`)
  console.log(`将插入 RelationshipObservation: ${stats.observations_to_insert}`)
  if (FOR_REAL) {
    console.log(`transaction 失败:       ${stats.transaction_failures}`)
  }

  if (previewSamples.length > 0) {
    console.log(`\n预览前 ${previewSamples.length} 条待迁移:`)
    for (const s of previewSamples) {
      console.log(
        `  ${s.id} (${s.name}): key=${s.keyFactsCount} pending=${s.pendingFactsCount}`,
      )
    }
  }

  if (!FOR_REAL && stats.will_migrate > 0) {
    console.log('\n  ⚠️  这是 dry-run,数据未写入。')
    console.log('  确认上方数据后跑: pnpm --filter @lianai/api backfill-profile-tables --for-real')
  } else if (FOR_REAL) {
    console.log('\n  ✓ 完成。basic_facts.key_facts / pending_facts 保留作冷备(M3 清理)')
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
