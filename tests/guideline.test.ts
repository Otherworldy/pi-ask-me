import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guideline } from "../src/guideline.ts";

describe("guideline", () => {
  it("asks first on a new Chinese task", () => {
    const g = guideline("把登录弄好", true);
    assert.match(g, /新任务/);
    assert.match(g, /ask_user_question/);
    assert.match(g, /不要用纯文本提问/);
    assert.match(g, /不要 write\/edit\/bash/);
  });

  it("tells the agent not to re-interview on follow-up", () => {
    const g = guideline("只改 API", false);
    assert.match(g, /不要重新采访/);
    assert.match(g, /ask_user_question/);
  });

  it("follows English prompts", () => {
    assert.match(guideline("fix login", true), /ask_user_question/);
    assert.match(guideline("ok continue", false), /follow-up/i);
  });
});
