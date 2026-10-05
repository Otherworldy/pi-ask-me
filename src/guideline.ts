import { hasCjk } from "./classify.ts";
import { ASK_USER_QUESTION } from "./ask.ts";

export function guideline(prompt: string, newTask: boolean): string {
  if (hasCjk(prompt)) {
    return newTask
      ? [
          "这条是新任务。先判断有没有会改变实现的歧义（目标、范围、改哪里、约束）。",
          `有：调用 ${ASK_USER_QUESTION}，用函数参数传 questions 数组（question、header、options[].label、options[].description），不要把问卷写成一段文本。preview 只放该选项自己的示意，不要把其他题目贴进去。等问卷 TUI 返回后再动手；得到回答前不要 write/edit/bash。不要用纯文本提问，不要自己写「Type something.」「Other」「Next」。一次把问题问完。`,
          "没有：直接做。不要改写用户原话，不要编造需求。",
        ].join("")
      : `这是续上或在回答你的问题。不要重新采访，不要再调用 ${ASK_USER_QUESTION}，按已有信息继续做。`;
  }
  return newTask
    ? [
        `This is a new task. If a missing decision would change what you implement (goal, scope, where, constraints), call ${ASK_USER_QUESTION} and pass a questions array as function parameters (question, header, options[].label, options[].description). Do not write the questionnaire as text. preview is a mockup of that one option only. multiSelect when several apply. Wait; do not write/edit/bash until it returns. Do not ask in chat text. Do not author "Type something.", "Other", or "Next". Group questions into one call.`,
        "If already clear, just do the work. Do not rewrite the user. Do not invent requirements.",
      ].join(" ")
    : `This is a follow-up or an answer to your question. Do not start a new interview; do not call ${ASK_USER_QUESTION} again; continue the work.`;
}
