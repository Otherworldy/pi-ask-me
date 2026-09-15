# 口语化提示词意图澄清插件设计实施方案

## Context

用户输入通常是口语化、上下文依赖强且省略约束的表达，例如“把登录弄好”“这个页面优化一下”。模型可能自行补全目标、范围和验收标准，随后直接调用工具，导致实现方向偏离。

本插件的目标不是把原始提示词改写得更书面，而是在主 agent 开始工作前增加一个意图澄清门：

- 自动判断当前输入是否像一个需要澄清的新任务；
- 需要澄清时，先用当前主模型生成问题；
- 使用用户当前语言提问；
- 原始用户文本保持不变；
- 问题未回答前，主 agent 不得启动；
- 澄清完成后，把原文和澄清结果交给主 agent 执行。

当前工作目录为空，实施边界是新建一个可被 pi 加载的 TypeScript 扩展包。

## Approach

采用“输入硬拦截 + 当前模型无工具提问 + 原文原样放行”的流程：

1. 在 `input` 事件中接收用户原始输入。
2. 只对“新任务候选”自动拦截。斜杠命令、插件自身发起的输入、空输入、正在流式处理时的 steer/follow-up，以及明显属于“继续/纠错/补充”的短消息直接返回 `continue`。
3. 新任务候选先返回 `handled`，阻止 Pi 启动主 agent；不返回 `transform`，也不修改原文。
4. 用当前 `ctx.model` 发起一次仅用于意图分析的模型请求。请求提示要求模型：
   - 判断是否存在会改变实现结果的关键歧义；
   - 最多生成少量、可回答的问题；
   - 使用用户输入的语言；
   - 不自行执行任务、不调用工具、不把猜测当事实；
   - 如果信息已经足够，返回无需提问。
5. 有问题时，在 TUI 中逐个向用户收集回答；回答过程不启动主 agent。用户取消、模型请求失败或结果解析失败时，保持本次输入被拦截，只提供“重试/取消本次输入”等恢复操作，绝不自动放行。
6. 问题回答完成后，保存一次性放行状态，重新提交**完全相同的原始文本**。插件通过 `before_agent_start` 为这一轮追加隐藏的澄清上下文；原始用户消息仍由 Pi 以原文写入会话，澄清结果不能伪装成用户原话。
7. 没有需要澄清的问题时直接、静默地重新提交原始输入，不增加提示消息。
8. 提供 `/prompt` 命令用于查看状态、关闭/开启自动澄清，以及对下一条输入执行一次澄清；命令自身不进入自动澄清流程。

第一版只支持 TUI。硬拦截只依赖 `input` 返回 `handled`；提问请求通过 pi 的公开模型注册表完成，使用当前模型和当前凭据，并显式传入空工具列表。即使模型没有遵守提问指令，也没有可调用的写入、编辑或 bash 工具。

## Files to modify

计划新建以下文件：

- `package.json`：声明 pi 包元数据、扩展入口、TypeScript 检查和测试脚本，以及 `@earendil-works/pi-coding-agent` peer dependency。
- `src/index.ts`：扩展入口、事件注册、配置状态和命令注册。
- `src/input-gate.ts`：输入分类、跳过规则、一次请求的生命周期和防重入状态。
- `src/clarifier.ts`：构造当前模型的澄清请求、解析受约束的结果、识别用户语言和问题列表。
- `src/question-ui.ts`：在 TUI 中展示问题并收集回答；第一版在非 TUI 模式不启用自动澄清。
- `src/context-injection.ts`：保存一次性放行状态，并在放行轮次通过 `before_agent_start` 注入隐藏的澄清上下文，不改写原始文本。
- `src/config.ts`：默认开关、问题数量上限、超时和跳过规则配置。
- `tests/*.test.ts`：覆盖纯逻辑分类、结果解析、原文不变和防重入；模型调用与完整 TUI 流程使用最小的集成/手工验证。
- `README.md`：安装、启用、配置、交互流程、硬拦截边界和已知限制。
- `tsconfig.json`：TypeScript 检查配置。

## Reuse

已确认可复用的 pi API 和现有模式：

- `@earendil-works/pi-coding-agent` 的 `ExtensionAPI.on("input", ...)`：输入事件发生在 agent 处理之前，可返回 `{ action: "handled" }` 形成硬门。
- `InputEvent` 的 `text`、`source`、`streamingBehavior` 和 `images`：用于识别原始输入来源、排除插件自身重新提交的输入及避免干预 steer/follow-up。
- `ExtensionUIContext.input()`、`select()`、`notify()`、`setWidget()`：用于问题收集和状态提示；实现只在 `ctx.mode === "tui"` 时启用。
- `ExtensionAPI.sendUserMessage()`：澄清完成后重新提交原始文本；Pi 会把这类输入标为 `source: "extension"`，因此可以用来源和一次性状态防止循环。
- `before_agent_start` 的 `message` 结果：追加只属于当前轮的隐藏 custom message；Pi 会先保留原始 user message，再追加该消息，因此适合注入澄清结果且不会改写原文。
- `ctx.modelRegistry.complete(ctx.model, context, options)`：公开 API 已确认可直接用当前模型完成一次普通请求；请求上下文传入 `tools: []`，选项传入当前 thinking level、AbortSignal 和超时。
- `ctx.sessionManager.buildSessionContext()`：为澄清模型提供已有会话上下文；实现只截取有界的最近消息，避免把完整历史和工具输出无上限复制到额外请求。
- 本机现有 `pi-agent-kit` 的包结构和入口模式：`/home/Node/pi-agent-kit/package.json`、`/home/Node/pi-agent-kit/src/index.ts`。
- 本机扩展类型定义：`/home/Node/pi-agent-kit/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`。
- 本机公开模型调用类型：`/home/Node/pi-agent-kit/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/models.d.ts`、`types.d.ts`。其中确认了 `ModelRegistry.complete`、`Context.tools`、`SimpleStreamOptions.signal/timeoutMs` 等接口。

## Steps

- [x] 确认当前安装版本的公开主模型调用方式：使用 `ctx.modelRegistry.complete(ctx.model, ...)` 复用当前模型和凭据，并传入空工具列表、取消信号和超时。
- [x] 初始化最小 pi 扩展包结构和 TypeScript 配置。
- [x] 实现输入分类器：命令、插件来源、短 follow-up、空输入、图像输入和正在流式处理的消息分别定义行为；默认只拦截新任务候选；非 TUI 直接放行并不启用自动澄清。
- [x] 实现防重入的硬门状态机：`idle → clarifying → collecting → releasing/aborted`，确保模型提问、用户回答和原始文本重新进入时不会无限循环或重复执行。
- [x] 实现澄清请求：使用主模型、用户语言、当前会话的有界上下文、无工具、有限问题数和有界 JSON 解析；模型失败或解析失败时保持拦截并提供重试/取消操作。
- [x] 实现问题收集：逐题收集回答，支持取消；回答为空时保留“未提供”状态，不替用户猜测；取消时不自动放行原任务。
- [x] 实现原文保留与澄清上下文注入：通过一次性放行状态调用 `sendUserMessage(originalText)`，在对应的 `before_agent_start` 中追加一次隐藏澄清消息，并验证原始用户文本完全一致。
- [x] 实现没有歧义时的静默放行，以及 `/prompt` 的开启、关闭、状态查看和单次触发行为。
- [x] 增加配置和 README，说明自动拦截的触发范围、模型调用成本、仅支持 TUI、失败/取消后的恢复行为。
- [x] 编写逻辑测试和最小集成测试，覆盖所有硬性需求及循环/失败路径。
- [x] 在真实 pi TUI 中进行端到端手工验证，再根据验证结果收敛默认跳过规则。

## Verification

自动检查：

- `npm run check` 通过。
- `npm test` 通过。
- 入口 smoke test 能加载默认导出。
- 单元测试证明输入分类不会对命令、插件输入和 follow-up 误拦截。
- 单元测试证明澄清结果解析拒绝越界问题、空问题和伪造的执行指令。
- 单元测试证明原始文本字节级保持不变，且同一轮澄清结果只注入一次。
- 测试证明模型请求失败、用户取消和会话切换后不会卡在门状态。

手工检查：

1. 输入“把登录弄好”，确认主 agent 尚未启动，先出现当前模型生成的问题。
2. 用中文回答问题，确认问题和 UI 使用中文；换用英文输入，确认提问语言随输入变化。
3. 完成澄清后，确认主 agent 收到原始用户文本和澄清结果，并可以正常使用项目工具。
4. 输入“继续”“不对，改 API”以及 `/prompt` 命令，确认不会错误触发新的完整采访。
5. 验证重复触发、模型报错、用户取消、重新加载扩展和切换 session 后都能恢复普通输入。
6. 使用弱模型验证硬门：即使模型不遵守“先问”说明，也无法在澄清阶段调用写入、编辑或 bash 工具。

## 已确定的边界

- 自动拦截只针对“新任务候选”；继续、纠错、补充等短 follow-up 和斜杠命令直接放行。
- 不需要澄清时静默放行原文，不显示额外确认消息。
- 澄清请求失败、格式无法解析或用户取消时，本次原始输入保持被拦截，不自动绕过；用户可以重试或取消本次输入后重新提交。
- 第一版只支持 TUI；RPC、print 和 json 模式不启用自动澄清。
- 图像输入按当前模型能力处理：当前模型支持图像时随澄清请求传入；不支持时不启动澄清请求并给出明确 UI 提示，避免丢失图像或错误执行。
