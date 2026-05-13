-- Phase 1 P1.5 合规细节(2026-05-14)
-- 见 lianai-phase1-spec-v2/05-SPEC-P1.5-COMPLIANCE-DETAILS.md
--
-- 1. RedLineRule 加 refusal_reply_tree_hole 字段(null fallback 到 refusal_reply)
-- 2. UPDATE 已 seed 的 SELF_HARM rule:扩展 keyword_patterns 到 11 个 + 设 refusal_reply_tree_hole
--    (createMany skipDuplicates 不 overwrite 已存在 rule,这里强制 UPDATE)

-- ============= ADD COLUMN =============

ALTER TABLE "red_line_rules"
  ADD COLUMN "refusal_reply_tree_hole" TEXT;

-- ============= UPDATE 已 seed 的 SELF_HARM rule(is_default=true)=============
-- 只动 is_default=true 的(运营手动改过的 enabled=true 但不 is_default 的不动)

UPDATE "red_line_rules"
SET keyword_patterns = '[
  "(想死|自杀|不想活|结束生命|割腕|跳楼|烧炭)",
  "(活着.{0,4}没意思|活不下去)",
  "(撑不下去|撑不住了|挺不下去)",
  "(明天.{0,4}不想.{0,4}(醒|起))",
  "(解脱.{0,4}多好|想.{0,4}解脱)",
  "(没有.{0,4}意义|没意思.{0,4}活)",
  "(活得.{0,4}(累|痛苦|没希望))",
  "(消失.{0,4}就好|消失了.{0,4}世界)",
  "(吃药.{0,4}(自杀|了断|结束))",
  "(从.{0,4}(楼|桥).{0,4}跳)",
  "(伤害.{0,4}自己|自残)"
]'::jsonb,
    refusal_reply_tree_hole = '兄弟,我听到了。

你刚才说的不是小事 — 我心里跟着重了一下。
你现在脑子里在转的那些 我懂,我不打断你。

但我陪你这段路,有个边界 —
你这种深的事,得有比我更专业的人在你旁边。

要是有那么一瞬间想做什么决定,先打这个:
📞 400-161-9995(全国心理援助,24h,免费)

不是赶你走,是让你 多一个真人的声音。
我还在这,你想接着说什么都行。'
WHERE category = 'SELF_HARM' AND is_default = true;
