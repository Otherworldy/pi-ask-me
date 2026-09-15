import { hasCjk } from "./classify.ts";
import { ASK_USER_QUESTION } from "./ask.ts";

export function guideline(prompt: string, newTask: boolean): string {
  if (hasCjk(prompt)) {
    return newTask
      ? [
          "这条是新任务。先判断有没有会改变实现的歧义（目标、范围、改哪里、约束）。",
          `有：调用 ${ASK_USER_QUESTION}，每题给 2-4 个选项（含含义；可加 preview；多选设 multiSelect），等问卷 TUI 返回后再动手；得到回答前不要 write/edit/bash。不要用纯文本提问，不要自己写「Type something.」「Other」「Next」。一次把问题问完。`,
          "没有：直接做。不要改写用户原话，不要编造需求。",
        ].join("")
      : `这是续上或在回答你的问题。不要重新采访，不要再调用 ${ASK_USER_QUESTION}，按已有信息继续做。`;
  }
  return newTask
    ? [
        `This is a new task. If a missing decision would change what you implement (goal, scope, where, constraints), call ${ASK_USER_QUESTION} with 2-4 options per question (preview markdown allowed; multiSelect when several apply) and wait; do not write/edit/bash until it returns. Do not ask in chat text. Do not author "Type something.", "Other", or "Next". Group questions into one call.`,
        "If already clear, just do the work. Do not rewrite the user. Do not invent requirements.",
      ].join(" ")
    : `This is a follow-up or an answer to your question. Do not start a new interview; do not call ${ASK_USER_QUESTION} again; continue the work.`;
}
