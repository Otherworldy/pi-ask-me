const FOLLOW_UP_EXACT = new Set([
  "继续",
  "接着",
  "接着做",
  "继续吧",
  "好的",
  "好",
  "行",
  "对",
  "嗯",
  "不对",
  "不是",
  "不行",
  "重来",
  "取消",
  "ok",
  "okay",
  "yes",
  "y",
  "no",
  "n",
]);

export function isFollowUp(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (FOLLOW_UP_EXACT.has(t.toLowerCase())) return true;
  if (/^(继续|接着)([吧啊呀！!。.]*)$/.test(t)) return true;
  if (/^(不对|不是|不行)([，,]\s*.{1,40})?$/.test(t)) return true;
  if (/^(改成|改用|换成)\s*.{1,40}$/.test(t)) return true;
  if (/^(不要|别|别改|先别).{0,20}$/.test(t)) return true;
  return false;
}

export function shouldAsk(text: string): boolean {
  const t = text.trim();
  if (!t || t.startsWith("/")) return false;
  return !isFollowUp(t);
}

export function hasCjk(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(text);
}
