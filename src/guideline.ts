import { hasCjk } from "./classify.ts";

export function guideline(prompt: string, newTask: boolean): string {
  if (hasCjk(prompt)) {
    return newTask
      ? [
          "这条是新任务。先判断有没有会改变实现的歧义（目标、范围、改哪里、约束）。",
          "有：用用户的语言最多问 3 个短问题，等回答；在得到回答前不要 write/edit/bash。",
          "没有：直接做。不要改写用户原话，不要编造需求。",
        ].join("")
      : "这是续上或在回答你的问题。不要重新采访，按已有信息继续做。";
  }
  return newTask
    ? [
        "This is a new task. If a missing decision would change what you implement (goal, scope, where, constraints), ask at most 3 short questions in the user's language and wait; do not write/edit/bash until answered.",
        "If already clear, just do the work. Do not rewrite the user. Do not invent requirements.",
      ].join(" ")
    : "This is a follow-up or an answer to your question. Do not start a new interview; continue the work.";
}
