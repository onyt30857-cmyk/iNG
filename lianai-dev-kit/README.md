# 练爱 - 开发包

这是练爱产品的完整开发文档包。解压后丢到项目根目录,Claude Code 会自动加载 `CLAUDE.md`,你就能开干了。

## 这个包是什么

练爱 = 一个让不擅社交的男生,慢慢学会和喜欢的人正常说话的 AI 产品。

用户上传聊天截图 → 老 K(AI)复盘 → 给三方向话术 + 解释。

这个包包含所有 Claude Code 需要的上下文:产品规格、技术架构、AI prompt、UI 规范、可执行的 spec。

## 怎么用这个包

### Step 1:把整个目录丢到你的项目根目录

```bash
# 假设你的项目在 ~/projects/lianai/
unzip lianai-dev-kit.zip -d ~/projects/lianai/

# 或者克隆到一个独立的 docs/ 目录
mv lianai-dev-kit ~/projects/lianai/docs/
```

### Step 2:启动 Claude Code

```bash
cd ~/projects/lianai/
claude
```

Claude Code 会自动读取 `CLAUDE.md` 作为长期记忆。

### Step 3:第一句话给 Claude

```
读一遍 README.md 和 CLAUDE.md。然后按 05-specs/spec-001-scaffold.md 开始
脚手架阶段的实施。每完成一个 task 告诉我,我确认后再做下一个。
```

## 文档结构

```
lianai-dev-kit/
├── README.md                          这份文档
├── CLAUDE.md                          项目宪法(Claude Code 自动加载)
│
├── 01-product/                        产品规格
│   ├── PRD.md                         产品需求文档
│   ├── persona-laoke.md               老 K 人格完整规格
│   └── scenarios.md                   31 个真实场景库
│
├── 02-architecture/                   技术架构
│   ├── system-architecture.md         总体架构和模块划分
│   ├── database-schema.prisma         可直接 migrate 的 Prisma schema
│   ├── api-design.md                  所有 API 接口完整定义
│   └── tech-decisions.md              18 个技术决策(ADR)
│
├── 03-prompts/                        AI 大脑(产品的核心)
│   ├── parsing.md                     PARSING 状态完整 prompt
│   ├── reflecting.md                  REFLECTING 状态完整 prompt
│   ├── diagnosing.md                  DIAGNOSING 状态完整 prompt
│   ├── planning.md                    PLANNING 状态完整 prompt
│   ├── drafting.md                    DRAFTING 状态完整 prompt
│   └── crisis.md                      危机干预独立 prompt
│
├── 04-design/                         UI 视觉
│   ├── design-system.md               完整 design tokens
│   └── pages.md                       所有页面 wireframe + 实现要点
│
├── 05-specs/                          可直接开干的 spec
│   ├── spec-001-scaffold.md           Week 1 脚手架
│   ├── spec-002-auth-wechat.md        Week 2 微信登录
│   ├── spec-003-relationship-crud.md  Week 2-3 关系档案 CRUD
│   ├── spec-004-ocr-upload.md         Week 4 截图上传 + OCR
│   └── spec-005-replay-state-machine.md Week 4-5 复盘状态机
│
└── 06-workflow/                       开发流程
    ├── dev-guide.md                   12 周开发指南
    └── spec-template.md               后续自己写 spec 的模板
```

## 阅读顺序

如果你是项目负责人,按这个顺序读完所有文档,大概 3-4 小时:

1. `README.md`(本文档)
2. `CLAUDE.md`(项目宪法)
3. `01-product/PRD.md`(产品需求)
4. `01-product/persona-laoke.md`(老 K 人格)
5. `02-architecture/system-architecture.md`(总体架构)
6. `02-architecture/database-schema.prisma`(数据库)
7. `02-architecture/tech-decisions.md`(技术决策)
8. `06-workflow/dev-guide.md`(12 周路线图)

后面的文档(prompt、API 设计、design system)是工作时查阅的参考,不需要顺序读。

## 12 周节奏概览

```
Week 1:    脚手架        spec-001
Week 2-3:  登录 + 关系   spec-002, spec-003
Week 4-5:  核心复盘流程   spec-004, spec-005
Week 6:    付费          (用 spec-template.md 自己写)
Week 7:    H5 试用版
Week 8:    基础完善
Week 9-10: 内测
Week 11:   上架
Week 12:   正式上线
```

## 给 Claude Code 的开工指令模板

实施 spec 时用这段:

```
我要按 [spec 路径] 实施 [功能名]。
1. 先读 CLAUDE.md 确认你了解项目宪法
2. 读这份 spec
3. 不要写代码,先列出 tasks
4. 我确认后,一个一个 task 实施
5. 每完成一个 task,跑测试,告诉我结果
6. 我验收通过后再做下一个
```

修改 prompt 时用这段:

```
我要修改 [prompt 路径]。修改后必须:
1. 跑 test/prompt-eval/ 下的测试集
2. 给我看 5 个测试 case 的输出对比
3. 让我评估前后差异
4. 我确认后才合并
```

## 心虚标注

这个开发包是基于现有信息做出的最佳规划,但有一些地方需要你在实施中验证、调整:

1. **AI 模型 ID** - 我用了 `claude-sonnet-4-20250514` 这个 ID 作为占位。开工时要确认 Anthropic API 当前提供的最新 Sonnet 模型 ID。
2. **Prompt 实际效果** - 我写的 5 份 prompt 是基于产品哲学和心理学模型设计的。开工后必须用 30+ 真实测试 case 跑一遍,根据输出反复打磨。
3. **OCR 准确率假设** - Gemini 2.5 Flash 对中文聊天截图的识别效果需要实测,可能需要换成 PaddleOCR 或其他备选。
4. **uni-app x 兼容性** - 某些复杂动效在 uni-app x 编译产物里可能要降级。第一周脚手架阶段就要测出来。

这些是 v1.0 的开发包,不是终版。M1 上线前必须有几次大的迭代修订。

## 开干

```bash
cd ~/projects/lianai/
claude
> 读一遍 README.md 和 CLAUDE.md。然后按 05-specs/spec-001-scaffold.md 开工。
```

祝你 12 周后产品上线顺利。
