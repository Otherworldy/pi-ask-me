import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import piPrompt from "../src/index.ts";

type Handler = (...args: never[]) => unknown;

function install() {
  const handlers = new Map<string, Handler>();
  let command: { name: string; handler: (args: string, ctx: unknown) => Promise<void> } | undefined;
  const notifies: string[] = [];
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
    registerCommand(name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) {
      command = { name, handler: options.handler };
    },
  } as unknown as ExtensionAPI;
  piPrompt(pi);
  const ctx: any = {
    ui: { notify: (m: string) => notifies.push(m) },
    sessionManager: { buildContextEntries: () => [] },
  };
  return { handlers, command, notifies, ctx };
}

describe("plugin wiring", () => {
  it("exports a factory", async () => {
    const mod = await import("../src/index.ts");
    assert.equal(typeof mod.default, "function");
  });

  it("does not register an input intercept", () => {
    const { handlers } = install();
    assert.equal(handlers.has("input"), false);
  });

  it("appends an ask-first guideline on a new task", async () => {
    const { handlers, ctx } = install();
    const result = await (handlers.get("before_agent_start") as Function)(
      { prompt: "把登录弄好", systemPrompt: "BASE" },
      ctx,
    );
    assert.equal(result.systemPrompt.startsWith("BASE\n\n"), true);
    assert.match(result.systemPrompt, /新任务/);
  });

  it("appends a continue guideline on follow-up", async () => {
    const { handlers, ctx } = install();
    const result = await (handlers.get("before_agent_start") as Function)(
      { prompt: "继续", systemPrompt: "BASE" },
      ctx,
    );
    assert.match(result.systemPrompt, /不要重新采访/);
  });

  it("does nothing when off", async () => {
    const { handlers, command, ctx } = install();
    await command?.handler("off", ctx);
    const result = await (handlers.get("before_agent_start") as Function)(
      { prompt: "把登录弄好", systemPrompt: "BASE" },
      ctx,
    );
    assert.equal(result, undefined);
  });

  it("treats an answer after a question as continuation", async () => {
    const { handlers, ctx } = install();
    ctx.sessionManager.buildContextEntries = () => [
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "改前端还是 API？" }] },
      },
    ];
    const result = await (handlers.get("before_agent_start") as Function)(
      { prompt: "只改 API", systemPrompt: "BASE" },
      ctx,
    );
    assert.match(result.systemPrompt, /不要重新采访/);
  });

  it("once forces ask-first even on follow-up", async () => {
    const { handlers, command, ctx } = install();
    await command?.handler("once", ctx);
    const result = await (handlers.get("before_agent_start") as Function)(
      { prompt: "继续", systemPrompt: "BASE" },
      ctx,
    );
    assert.match(result.systemPrompt, /新任务/);
  });
});
