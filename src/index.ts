import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
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
