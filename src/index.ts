import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ASK_USER_QUESTION, AskParamsSchema, formatAskResult, normalizeQuestions, runQuestionnaire } from "./ask.ts";
import { shouldAsk } from "./classify.ts";
import { defaultConfig, type PromptConfig } from "./config.ts";
import { guideline } from "./guideline.ts";

function textOf(msg: { content?: unknown }): string {
  const c = msg.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.map((p) => (p && typeof p === "object" && (p as { type?: string }).type === "text" ? String((p as { text?: string }).text ?? "") : "")).join("");
}

function lastAssistantAsked(ctx: ExtensionContext): boolean {
  const entries = ctx.sessionManager.buildContextEntries();
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.type !== "message") continue;
    const msg = e.message as { role?: string; content?: unknown };
    if (msg.role !== "assistant") continue;
    return /[？?]/.test(textOf(msg));
  }
  return false;
}

export default function piPrompt(pi: ExtensionAPI) {
  const config: PromptConfig = defaultConfig();
  let forceOnce = false;

  pi.registerTool({
    name: ASK_USER_QUESTION,
    label: "Ask User",
    description:
      "Ask the user 1-4 structured questions with 2-4 options each when a missing decision would change what you implement. Opens a tabbed TUI: arrow keys, Enter, Space for multiSelect, n for a note, Esc to cancel. Each option needs a label and description. Optional options[].preview markdown (single-select only) shows a side-by-side mockup. Set multiSelect when several answers are valid. Do not ask as chat text. Do not author Type something. / Other / Next — they are appended automatically. If you recommend an option, put it first and append (Recommended) to the label. Wait for the tool result before write/edit/bash. Group all clarifying questions into one call.",
    promptSnippet: "Ask the user structured multiple-choice questions in a TUI",
    parameters: AskParamsSchema as never,
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx) {
      const normalized = normalizeQuestions(params);
      if (!normalized.ok) {
        return { content: [{ type: "text" as const, text: normalized.message }] };
      }
      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: UI not available. Ask as chat text instead, without this tool.",
            },
          ],
        };
      }
      if ((ctx as { mode?: string }).mode === "tui") {
        const { runAskTui } = await import("./ask-tui.ts");
        const tuiResult = await runAskTui(ctx, normalized.questions);
        if (tuiResult) {
          return { content: [{ type: "text" as const, text: formatAskResult(tuiResult) }], details: tuiResult };
        }
      }
      const result = await runQuestionnaire(ctx.ui, normalized.questions, signal);
      return { content: [{ type: "text" as const, text: formatAskResult(result) }], details: result };
    },
  });

  pi.on("before_agent_start", (event, ctx) => {
    if (!config.enabled && !forceOnce) return;
    const once = forceOnce;
    forceOnce = false;
    const extra = guideline(event.prompt, once || (shouldAsk(event.prompt) && !lastAssistantAsked(ctx)));
    return { systemPrompt: `${event.systemPrompt}\n\n${extra}` };
  });

  pi.registerCommand("prompt", {
    description: "意图澄清：on | off | once | status",
    handler: async (args, ctx) => {
      const cmd = args.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      if (cmd === "on") {
        config.enabled = true;
        ctx.ui.notify("pi-prompt: 自动澄清已开启");
        return;
      }
      if (cmd === "off") {
        config.enabled = false;
        forceOnce = false;
        ctx.ui.notify("pi-prompt: 自动澄清已关闭");
        return;
      }
      if (cmd === "once") {
        forceOnce = true;
        ctx.ui.notify("pi-prompt: 下一条将提醒先问");
        return;
      }
      const state = config.enabled ? "on" : "off";
      const once = forceOnce ? "，once 已排队" : "";
      ctx.ui.notify(`pi-prompt: ${state}${once}`);
    },
  });
}
