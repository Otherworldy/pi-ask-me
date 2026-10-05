import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAskResult,
  formatOption,
  normalizeQuestions,
  parseChoice,
  prepareAskArguments,
  rowCount,
  runQuestionnaire,
  TYPE_SOMETHING,
} from "../src/ask.ts";

const sample = {
  questions: [
    {
      question: "改前端还是 API？",
      header: "范围",
      options: [
        { label: "只改 API", description: "不动 UI" },
        { label: "只改前端", description: "不动后端" },
        { label: "两边都改", description: "联调一起做" },
      ],
    },
  ],
};

describe("normalizeQuestions", () => {
  it("accepts a valid questionnaire", () => {
    const n = normalizeQuestions(sample);
    assert.equal(n.ok, true);
    if (n.ok) assert.equal(n.questions[0].header, "范围");
  });
  it("rejects reserved Type something.", () => {
    const n = normalizeQuestions({
      questions: [
        {
          question: "Which?",
          options: [
            { label: "A", description: "a" },
            { label: "Type something.", description: "no" },
          ],
        },
      ],
    });
    assert.equal(n.ok, false);
  });
  it("rejects one option", () => {
    const n = normalizeQuestions({
      questions: [{ question: "Which?", options: [{ label: "A", description: "a" }] }],
    });
    assert.equal(n.ok, false);
  });
  it("rejects reserved Next", () => {
    const n = normalizeQuestions({
      questions: [
        {
          question: "Which?",
          options: [
            { label: "A", description: "a" },
            { label: "Next", description: "no" },
          ],
        },
      ],
    });
    assert.equal(n.ok, false);
  });
  it("rejects a prose blob", () => {
    const n = normalizeQuestions({ questions: "待办队列的第一版范围？\n1. 只做用户手写" });
    assert.equal(n.ok, false);
  });
  it("drops a preview that contains another question", () => {
    const n = normalizeQuestions({
      questions: [
        {
          question: "待办队列的第一版范围？",
          options: [
            { label: "只做手写", description: "手动开始", preview: "待办和当前聊天是不是分开的两套东西？\n是，另一条产品" },
            { label: "加上定时", description: "到点开跑" },
          ],
        },
        {
          question: "待办和当前聊天是不是分开的两套东西？",
          options: [
            { label: "分开", description: "另一条产品" },
            { label: "不分开", description: "还是这条聊天" },
          ],
        },
      ],
    });
    assert.equal(n.ok, true);
    if (n.ok) assert.equal(n.questions[0].options[0].preview, undefined);
  });
  it("keeps preview on single-select and drops it on multiSelect", () => {
    const single = normalizeQuestions({
      questions: [
        {
          question: "Which?",
          options: [
            { label: "A", description: "a", preview: "```\nA\n```" },
            { label: "B", description: "b" },
          ],
        },
      ],
    });
    assert.equal(single.ok, true);
    if (single.ok) assert.equal(single.questions[0].options[0].preview, "```\nA\n```");
    const multi = normalizeQuestions({
      questions: [
        {
          question: "Which?",
          multiSelect: true,
          options: [
            { label: "A", description: "a", preview: "nope" },
            { label: "B", description: "b" },
          ],
        },
      ],
    });
    assert.equal(multi.ok, true);
    if (multi.ok) {
      assert.equal(multi.questions[0].multiSelect, true);
      assert.equal(multi.questions[0].options[0].preview, undefined);
      assert.equal(rowCount(multi.questions[0]), 4);
    }
  });
});

describe("prepareAskArguments", () => {
  it("restores a stringified questions array and leaves prose", () => {
    const restored = prepareAskArguments({
      questions: JSON.stringify([{ question: "范围？", options: "[{\"label\":\"A\"}]" }]),
    }) as { questions: { options: unknown }[] };
    assert.equal(restored.questions[0].question, "范围？");
    assert.deepEqual(restored.questions[0].options, [{ label: "A" }]);
    const prose = prepareAskArguments({ questions: "不是 json" }) as { questions: unknown };
    assert.equal(prose.questions, "不是 json");
  });
});

describe("parseChoice", () => {
  it("matches the formatted line or a leading number", () => {
    const labels = [formatOption({ label: "只改 API", description: "不动 UI" }, 0), `2. ${TYPE_SOMETHING}`];
    assert.equal(parseChoice(labels[0], labels), 0);
    assert.equal(parseChoice("2", labels), 1);
    assert.equal(parseChoice("nope", labels), null);
    assert.equal(parseChoice("只改 API", labels), 0);
    const numbered = [formatOption({ label: "2周方案", description: "更快" }, 0), labels[1]];
    assert.equal(parseChoice("2周方案", numbered), 0);
  });
});

describe("runQuestionnaire", () => {
  it("returns the selected label", async () => {
    const n = normalizeQuestions(sample);
    assert.equal(n.ok, true);
    if (!n.ok) return;
    const labels: string[] = [];
    const result = await runQuestionnaire(
      {
        select: async (title, options) => {
          labels.push(title, ...options);
          return options[0];
        },
        input: async () => {
          throw new Error("should not input");
        },
      },
      n.questions,
    );
    assert.equal(result.cancelled, false);
    assert.equal(result.answers[0].answer, "只改 API");
    assert.match(labels[0], /改前端还是 API/);
  });
  it("opens input on Type something.", async () => {
    const result = await runQuestionnaire(
      {
        select: async (_t, options) => options.at(-1),
        input: async () => "先别动登录",
      },
      [{ question: "范围？", options: [{ label: "API", description: "a" }, { label: "UI", description: "b" }] }],
    );
    assert.equal(result.answers[0].custom, true);
    assert.equal(result.answers[0].answer, "先别动登录");
  });
  it("cancels when select is dismissed", async () => {
    const result = await runQuestionnaire(
      { select: async () => undefined, input: async () => "x" },
      [{ question: "范围？", options: [{ label: "API", description: "a" }, { label: "UI", description: "b" }] }],
    );
    assert.equal(result.cancelled, true);
    assert.equal(formatAskResult(result), "User declined to answer questions");
  });
  it("parses multiSelect numbers", async () => {
    const result = await runQuestionnaire(
      { select: async () => "x", input: async () => "1,2" },
      [
        {
          question: "要哪些？",
          multiSelect: true,
          options: [
            { label: "API", description: "a" },
            { label: "UI", description: "b" },
            { label: "测试", description: "c" },
          ],
        },
      ],
    );
    assert.deepEqual(result.answers[0].selected, ["API", "UI"]);
  });
});

describe("formatAskResult", () => {
  it("includes preview, notes and global note", () => {
    const text = formatAskResult({
      cancelled: false,
      answers: [
        {
          question: "范围？",
          answer: "API",
          custom: false,
          preview: "POST /login",
          notes: "别动 UI",
        },
      ],
      globalNote: "尽快",
    });
    assert.match(text, /"范围？"="API"/);
    assert.match(text, /selected preview: POST \/login/);
    assert.match(text, /user notes: 别动 UI/);
    assert.match(text, /global note: 尽快/);
  });
});
