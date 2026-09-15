# pi-prompt

口语任务先问再做。不改用户原文，不拦截输入。有歧义时主 agent 调 `ask_user_question` 弹出问卷 TUI。

## 做什么

新任务回合在 system prompt 里加一段提醒：有会改变实现的歧义就调用 `ask_user_question`（每题 2–4 个选项），等问卷返回；没歧义就直接干。

续上、纠错、回答问题的回合改成「别重新采访，继续做」。

问卷（TUI overlay）：

- 多题用 Tab 切换，最后一页 Submit
- ↑↓ 选择，Enter 确认，每题自动带 `Type something.`
- `multiSelect`：Space 勾选，选 `Next` 提交该题
- 选项可带 `preview`（markdown），宽屏并排、窄屏叠在选项下面
- `n` 给当前题（或 Submit 页）加笔记
- Esc 取消整份问卷

非 TUI（RPC）退回系统自带的 `select`/`input`。

## 不做什么

- 不改写原文
- 不拦截 `input`、不另开一轮无工具模型
- 不硬拦 `write`/`edit`/`bash`（弱模型可能仍直接动手）
- 不折叠 overlay、不接 i18n、不调外部编辑器

## 命令

```
/prompt          状态
/prompt on       开启（默认）
/prompt off      关闭
/prompt once     下一条按新任务提醒先问
```
