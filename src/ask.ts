export const ASK_USER_QUESTION = "ask_user_question";
export const TYPE_SOMETHING = "Type something.";
export const NEXT_LABEL = "Next";

const RESERVED = new Set(["other", "type something.", "next"]);
const MAX_QUESTIONS = 4;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_PREVIEW = 600;

export type AskOption = { label: string; description: string; preview?: string };
export type AskQuestion = { question: string; header?: string; multiSelect?: boolean; options: AskOption[] };
export type AskAnswer = {
  question: string;
  answer: string;
  custom: boolean;
  selected?: string[];
  notes?: string;
  preview?: string;
};
export type AskResult = { cancelled: boolean; answers: AskAnswer[]; globalNote?: string };

export type DialogUI = {
  select: (title: string, options: string[], opts?: { signal?: AbortSignal }) => Promise<string | undefined>;
  input: (title: string, placeholder?: string, opts?: { signal?: AbortSignal }) => Promise<string | undefined>;
};

/** JSON Schema. Host TypeBox compiles this; no local typebox install. */
export const AskParamsSchema = {
  type: "object",
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: MAX_QUESTIONS,
      description: "Questions to ask (1-4). Group all clarifying questions into one call.",
      items: {
        type: "object",
        required: ["question", "options"],
        properties: {
          question: { type: "string", description: "Complete question, ending with ?." },
          header: { type: "string", maxLength: 16, description: "Short chip, e.g. Scope, Auth." },
          multiSelect: {
            type: "boolean",
            description: "True when several options can be chosen together.",
          },
          options: {
            type: "array",
            minItems: MIN_OPTIONS,
            maxItems: MAX_OPTIONS,
            description: "2-4 choices. Do not include Type something. / Other / Next — appended automatically.",
            items: {
              type: "object",
              required: ["label", "description"],
              properties: {
                label: { type: "string", maxLength: 60, description: "1-5 words. Append (Recommended) to the preferred option." },
                description: { type: "string", description: "What this choice means or costs." },
                preview: {
                  type: "string",
                  description: "Optional markdown mockup/code/diagram for side-by-side compare. Single-select only.",
                },
              },
            },
          },
        },
      },
    },
  },
};

export function formatOption(option: AskOption, index: number): string {
  return `${index + 1}. ${option.label} — ${option.description}`;
}

export function parseChoice(chosen: string, labels: string[]): number | null {
  const exact = labels.indexOf(chosen);
  if (exact >= 0) return exact;
  const i = Number.parseInt(chosen, 10) - 1;
  return i >= 0 && i < labels.length ? i : null;
}

export function rowCount(q: AskQuestion): number {
  return q.options.length + 1 + (q.multiSelect ? 1 : 0);
}

export function normalizeQuestions(raw: unknown): { ok: true; questions: AskQuestion[] } | { ok: false; message: string } {
  const questions = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(questions) || questions.length < 1) return { ok: false, message: "Error: provide 1-4 questions" };
  if (questions.length > MAX_QUESTIONS) return { ok: false, message: `Error: at most ${MAX_QUESTIONS} questions` };

  const out: AskQuestion[] = [];
  for (const q of questions) {
    if (!q || typeof q !== "object") return { ok: false, message: "Error: invalid question" };
    const rec = q as Record<string, unknown>;
    const question = String(rec.question ?? "").trim();
    if (!question) return { ok: false, message: "Error: each question needs text" };
    if (!Array.isArray(rec.options) || rec.options.length < MIN_OPTIONS || rec.options.length > MAX_OPTIONS) {
      return { ok: false, message: `Error: each question needs ${MIN_OPTIONS}-${MAX_OPTIONS} options` };
    }
    const multiSelect = rec.multiSelect === true;
    const options: AskOption[] = [];
    const seen = new Set<string>();
    for (const o of rec.options) {
      if (!o || typeof o !== "object") return { ok: false, message: "Error: invalid option" };
      const opt = o as Record<string, unknown>;
      const label = String(opt.label ?? "").trim();
      if (!label) return { ok: false, message: "Error: option label required" };
      if (RESERVED.has(label.toLowerCase())) {
        return { ok: false, message: `Error: reserved label ${JSON.stringify(label)} — Type something. / Next are appended automatically` };
      }
      const key = label.toLowerCase();
      if (seen.has(key)) return { ok: false, message: `Error: duplicate option ${JSON.stringify(label)}` };
      seen.add(key);
      const preview = !multiSelect && typeof opt.preview === "string" && opt.preview.trim() ? opt.preview : undefined;
      options.push({ label, description: String(opt.description ?? "").trim(), ...(preview ? { preview } : {}) });
    }
    const header = typeof rec.header === "string" ? rec.header.trim().slice(0, 16) : "";
    out.push({ question, options, ...(header ? { header } : {}), ...(multiSelect ? { multiSelect: true } : {}) });
  }
  return { ok: true, questions: out };
}

function previewBlock(q: AskQuestion): string {
  const blocks = q.options.flatMap((o, i) =>
    o.preview ? [`--- ${i + 1}. ${o.label} preview ---\n${o.preview.slice(0, MAX_PREVIEW)}`] : [],
  );
  return blocks.length ? `\n\n${blocks.join("\n\n")}` : "";
}

export async function runQuestionnaire(ui: DialogUI, questions: AskQuestion[], signal?: AbortSignal): Promise<AskResult> {
  const answers: AskAnswer[] = [];
  for (const q of questions) {
    const header = q.header ? `[${q.header}] ` : "";
    const answer = q.multiSelect ? await askMulti(ui, q, header, signal) : await askSingle(ui, q, header, signal);
    if (!answer) return { cancelled: true, answers };
    answers.push(answer);
  }
  return { cancelled: false, answers };
}

async function askSingle(ui: DialogUI, q: AskQuestion, header: string, signal?: AbortSignal): Promise<AskAnswer | undefined> {
  const labels = q.options.map(formatOption);
  labels.push(`${q.options.length + 1}. ${TYPE_SOMETHING}`);
  const chosen = await ui.select(`${header}${q.question}${previewBlock(q)}`, labels, { signal });
  if (chosen == null) return undefined;
  const idx = parseChoice(chosen, labels);
  if (idx == null) return undefined;
  if (idx < q.options.length) {
    const o = q.options[idx];
    return { question: q.question, answer: o.label, custom: false, ...(o.preview ? { preview: o.preview } : {}) };
  }
  const typed = await ui.input(`${header}${q.question}\n\nType your answer:`, "", { signal });
  if (typed == null) return undefined;
  return { question: q.question, answer: typed, custom: true };
}

async function askMulti(ui: DialogUI, q: AskQuestion, header: string, signal?: AbortSignal): Promise<AskAnswer | undefined> {
  const list = q.options.map(formatOption).join("\n");
  const value = await ui.input(
    `${header}${q.question}\n\n${list}\n\nEnter numbers of all that apply, comma-separated (e.g. "1,3"), or type a custom answer.`,
    "1,3",
    { signal },
  );
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return { question: q.question, answer: "", custom: false, selected: [] };
  const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
  const indices = tokens.map((tok) => (/^\d+\.?$/.test(tok) ? parseChoice(tok, q.options.map(formatOption)) : null));
  if (indices.every((i): i is number => i != null && i < q.options.length)) {
    const selected: string[] = [];
    for (const i of indices) {
      const label = q.options[i].label;
      if (!selected.includes(label)) selected.push(label);
    }
    return { question: q.question, answer: selected.join(", "), custom: false, selected };
  }
  return { question: q.question, answer: trimmed, custom: true };
}

export function formatAskResult(result: AskResult): string {
  if (result.cancelled) return "User declined to answer questions";
  const parts = result.answers.map((a) => {
    const val = a.selected?.length ? a.selected.join(", ") : a.answer || "(no input)";
    const bits = [`"${a.question}"="${val}"`];
    if (a.preview) bits.push(`selected preview: ${a.preview}`);
    if (a.notes) bits.push(`user notes: ${a.notes}`);
    return `${bits.join(". ")}.`;
  });
  if (result.globalNote) parts.push(`global note: ${result.globalNote}.`);
  if (parts.length === 0) return "User declined to answer questions";
  return `User has answered your questions: ${parts.join(" ")} You can now continue with the user's answers in mind.`;
}
