import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFollowUp, shouldAsk } from "../src/classify.ts";

describe("isFollowUp", () => {
  for (const text of ["继续", "接着做", "不对", "不对，改 API", "改成 POST", "不要重构", "ok", "yes"]) {
    it(`treats ${JSON.stringify(text)} as follow-up`, () => {
      assert.equal(isFollowUp(text), true);
    });
  }
  for (const text of ["把登录弄好", "优化这个页面", "加一个用户列表", "只改 API"]) {
    it(`treats ${JSON.stringify(text)} as a task or answer`, () => {
      assert.equal(isFollowUp(text), false);
    });
  }
});

describe("shouldAsk", () => {
  it("asks on a new task", () => {
    assert.equal(shouldAsk("把登录弄好"), true);
  });
  it("does not ask on follow-up or slash", () => {
    assert.equal(shouldAsk("继续"), false);
    assert.equal(shouldAsk("/prompt"), false);
    assert.equal(shouldAsk("  "), false);
  });
});
