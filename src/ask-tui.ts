import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  Editor,
  type EditorTheme,
  isKeyRelease,
  isKeyRepeat,
  Key,
  matchesKey,
  Markdown,
  type MarkdownTheme,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
  NEXT_LABEL,
  TYPE_SOMETHING,
  type AskAnswer,
  type AskQuestion,
  type AskResult,
} from "./ask.ts";

const PREVIEW_SIDE_MIN = 100;

function mdTheme(theme: Theme): MarkdownTheme {
  return {
    heading: (t) => theme.bold(theme.fg("mdHeading", t)),
    link: (t) => theme.fg("mdLink", t),
    linkUrl: (t) => theme.fg("mdLinkUrl", t),
    code: (t) => theme.fg("mdCode", t),
    codeBlock: (t) => theme.fg("mdCodeBlock", t),
    codeBlockBorder: (t) => theme.fg("mdCodeBlockBorder", t),
    quote: (t) => theme.fg("mdQuote", t),
    quoteBorder: (t) => theme.fg("mdQuoteBorder", t),
    hr: (t) => theme.fg("mdHr", t),
    listBullet: (t) => theme.fg("mdListBullet", t),
    bold: (t) => theme.bold(t),
    italic: (t) => theme.italic(t),
    strikethrough: (t) => theme.strikethrough(t),
    underline: (t) => theme.underline(t),
  };
}

function editorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: (s) => theme.fg("accent", s),
    selectList: {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    },
  };
}

function box(lines: string[], width: number, color: (s: string) => string): string[] {
  const inner = Math.max(1, width - 2);
  const body = lines.map((l) => `${color("│")}${truncateToWidth(l, inner, "", true)}${color("│")}`);
  return [color(`┌${"─".repeat(inner)}┐`), ...body, color(`└${"─".repeat(inner)}┘`)];
}

function zip(left: string[], right: string[], leftW: number): string[] {
  const n = Math.max(left.length, right.length);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${truncateToWidth(left[i] ?? "", leftW, "", true)} ${right[i] ?? ""}`);
  }
  return out;
}

export async function runAskTui(ctx: Pick<ExtensionContext, "ui">, questions: AskQuestion[]): Promise<AskResult | undefined> {
  const isMulti = questions.length > 1;
  const totalTabs = isMulti ? questions.length + 1 : questions.length;

  return ctx.ui.custom<AskResult>(
    (tui, theme, _kb, done) => {
      let tab = 0;
      let optionIndex = 0;
      let mode: "pick" | "other" | "note" = "pick";
      let noteTarget: "q" | "global" = "q";
      let cached: string[] | undefined;
      const answers = new Map<number, AskAnswer>();
      const checked = new Map<number, Set<number>>();
      const notes = new Map<number, string>();
      let globalNote = "";
      const editor = new Editor(tui, editorTheme(theme));
      const markdown = new Markdown("", 0, 0, mdTheme(theme));

      function refresh() {
        cached = undefined;
        editor.focused = mode !== "pick";
        tui.requestRender();
      }

      function finish(cancelled: boolean) {
        const list = questions.map((_, i) => answers.get(i)).filter((a): a is AskAnswer => !!a);
        done({ cancelled, answers: list, ...(globalNote ? { globalNote } : {}) });
      }

      function q(): AskQuestion | undefined {
        return questions[tab];
      }

      function otherIndex(question: AskQuestion) {
        return question.options.length;
      }
      function nextIndex(question: AskQuestion) {
        return question.multiSelect ? question.options.length + 1 : -1;
      }
      function maxIndex(question: AskQuestion) {
        return question.options.length + (question.multiSelect ? 1 : 0);
      }

      function allAnswered() {
        return questions.every((_, i) => answers.has(i));
      }

      function attachNotes(a: AskAnswer, i: number): AskAnswer {
        const n = notes.get(i);
        return n ? { ...a, notes: n } : a;
      }

      function advance() {
        if (!isMulti) {
          finish(false);
          return;
        }
        tab = tab < questions.length - 1 ? tab + 1 : questions.length;
        optionIndex = 0;
        mode = "pick";
        refresh();
      }

      function saveOption(question: AskQuestion, i: number) {
        const o = question.options[i];
        answers.set(tab, attachNotes({
          question: question.question,
          answer: o.label,
          custom: false,
          ...(o.preview ? { preview: o.preview } : {}),
        }, tab));
        advance();
      }

      function saveCustom(text: string) {
        const question = q();
        if (!question) return;
        answers.set(tab, attachNotes({
          question: question.question,
          answer: text.trim() || "(no input)",
          custom: true,
        }, tab));
        mode = "pick";
        editor.setText("");
        advance();
      }

      function saveMulti() {
        const question = q();
        if (!question) return;
        const selected: string[] = [];
        for (const i of [...(checked.get(tab) ?? new Set())].sort((a, b) => a - b)) {
          selected.push(question.options[i].label);
        }
        answers.set(tab, attachNotes({
          question: question.question,
          answer: selected.join(", "),
          custom: false,
          selected,
        }, tab));
        advance();
      }

      editor.onSubmit = (value) => {
        if (mode === "other") saveCustom(value);
        else if (mode === "note") closeNote(true);
      };
      editor.onChange = () => refresh();

      function closeNote(save: boolean) {
        if (save) {
          const text = editor.getText().trim();
          if (noteTarget === "global") globalNote = text;
          else {
            if (text) notes.set(tab, text);
            else notes.delete(tab);
            const a = answers.get(tab);
            if (a) a.notes = text || undefined;
          }
        }
        mode = "pick";
        editor.setText("");
        refresh();
      }

      function handleInput(data: string) {
        if (isKeyRelease(data)) return;
        if (mode !== "pick") {
          if (matchesKey(data, Key.escape)) {
            if (mode === "note") closeNote(true);
            else finish(true);
            return;
          }
          editor.handleInput(data);
          refresh();
          return;
        }

        if (matchesKey(data, Key.escape)) {
          finish(true);
          return;
        }

        if (isMulti && (matchesKey(data, Key.tab) || matchesKey(data, Key.right))) {
          tab = (tab + 1) % totalTabs;
          optionIndex = 0;
          refresh();
          return;
        }
        if (isMulti && (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left))) {
          tab = (tab - 1 + totalTabs) % totalTabs;
          optionIndex = 0;
          refresh();
          return;
        }

        const submitTab = isMulti && tab === questions.length;
        if (submitTab) {
          if (matchesKey(data, "n") && !isKeyRepeat(data)) {
            noteTarget = "global";
            mode = "note";
            editor.setText(globalNote);
            refresh();
            return;
          }
          if (matchesKey(data, Key.enter) && allAnswered()) finish(false);
          return;
        }

        const question = q();
        if (!question) return;
        const max = maxIndex(question);

        if (matchesKey(data, Key.up)) {
          optionIndex = optionIndex <= 0 ? max : optionIndex - 1;
          refresh();
          return;
        }
        if (matchesKey(data, Key.down)) {
          optionIndex = optionIndex >= max ? 0 : optionIndex + 1;
          refresh();
          return;
        }

        if (matchesKey(data, "n") && !isKeyRepeat(data)) {
          noteTarget = "q";
          mode = "note";
          editor.setText(notes.get(tab) ?? "");
          refresh();
          return;
        }

        const onOther = optionIndex === otherIndex(question);
        const onNext = optionIndex === nextIndex(question);
        const onOpt = optionIndex < question.options.length;

        if (question.multiSelect && onOpt && (matchesKey(data, Key.space) || matchesKey(data, Key.enter))) {
          const set = checked.get(tab) ?? new Set();
          if (set.has(optionIndex)) set.delete(optionIndex);
          else set.add(optionIndex);
          checked.set(tab, set);
          refresh();
          return;
        }

        if (matchesKey(data, Key.enter)) {
          if (onOther) {
            mode = "other";
            editor.setText("");
            refresh();
            return;
          }
          if (onNext) {
            saveMulti();
            return;
          }
          if (onOpt) saveOption(question, optionIndex);
        }
      }

      function addWrapped(lines: string[], text: string, width: number) {
        lines.push(...wrapTextWithAnsi(text, width));
      }
      function addPrefixed(lines: string[], prefix: string, text: string, width: number) {
        const pw = visibleWidth(prefix);
        if (pw >= width) {
          addWrapped(lines, prefix + text, width);
          return;
        }
        const wrapped = wrapTextWithAnsi(text, width - pw);
        const cont = " ".repeat(pw);
        for (let i = 0; i < wrapped.length; i++) lines.push(`${i === 0 ? prefix : cont}${wrapped[i]}`);
      }

      function renderOptions(question: AskQuestion, width: number): string[] {
        const lines: string[] = [];
        const set = checked.get(tab) ?? new Set();
        for (let i = 0; i < question.options.length; i++) {
          const o = question.options[i];
          const sel = i === optionIndex;
          const prefix = sel ? theme.fg("accent", "> ") : "  ";
          const check = question.multiSelect ? (set.has(i) ? "[x] " : "[ ] ") : "";
          addPrefixed(lines, prefix, theme.fg(sel ? "accent" : "text", `${i + 1}. ${check}${o.label}`), width);
          if (o.description) addPrefixed(lines, "     ", theme.fg("muted", o.description), width);
        }
        const otherSel = optionIndex === otherIndex(question) || mode === "other";
        addPrefixed(
          lines,
          otherSel ? theme.fg("accent", "> ") : "  ",
          theme.fg(otherSel ? "accent" : "text", `${question.options.length + 1}. ${TYPE_SOMETHING}${mode === "other" ? " ✎" : ""}`),
          width,
        );
        if (question.multiSelect) {
          const nextSel = optionIndex === nextIndex(question);
          addPrefixed(
            lines,
            nextSel ? theme.fg("accent", "> ") : "  ",
            theme.fg(nextSel ? "accent" : "text", `${question.options.length + 2}. ${NEXT_LABEL}`),
            width,
          );
        }
        return lines;
      }

      function renderPreview(text: string, width: number): string[] {
        markdown.setText(text);
        return box(markdown.render(Math.max(8, width - 2)), width, (s) => theme.fg("border", s));
      }

      function render(width: number): string[] {
        if (cached) return cached;
        const w = Math.max(1, width);
        const lines: string[] = [theme.fg("accent", "─".repeat(w))];

        if (isMulti) {
          const tabs: string[] = ["← "];
          for (let i = 0; i < questions.length; i++) {
            const active = i === tab;
            const answered = answers.has(i);
            const label = questions[i].header || `Q${i + 1}`;
            const boxMark = answered ? "■" : "□";
            const text = ` ${boxMark} ${label} `;
            const styled = active ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg(answered ? "success" : "muted", text);
            tabs.push(`${styled} `);
          }
          const onSubmit = tab === questions.length;
          const submitText = " ✓ Submit ";
          const submitStyled = onSubmit
            ? theme.bg("selectedBg", theme.fg("text", submitText))
            : theme.fg(allAnswered() ? "success" : "dim", submitText);
          tabs.push(`${submitStyled} →`);
          addPrefixed(lines, " ", tabs.join(""), w);
          lines.push("");
        }

        const question = q();
        const submitTab = isMulti && tab === questions.length;

        if (mode === "note") {
          addPrefixed(lines, " ", theme.fg("accent", noteTarget === "global" ? "Global note" : "Note"), w);
          lines.push("");
          for (const line of editor.render(Math.max(1, w - 2))) lines.push(` ${line}`);
          lines.push("");
          addPrefixed(lines, " ", theme.fg("dim", "Enter/Esc to close"), w);
        } else if (mode === "other" && question) {
          addPrefixed(lines, " ", theme.fg("text", question.question), w);
          lines.push("");
          addPrefixed(lines, " ", theme.fg("muted", "Your answer:"), w);
          for (const line of editor.render(Math.max(1, w - 2))) lines.push(` ${line}`);
          lines.push("");
          addPrefixed(lines, " ", theme.fg("dim", "Enter to submit • Esc to cancel questionnaire"), w);
        } else if (submitTab) {
          addPrefixed(lines, " ", theme.fg("accent", theme.bold("Ready to submit")), w);
          lines.push("");
          for (let i = 0; i < questions.length; i++) {
            const a = answers.get(i);
            const label = questions[i].header || `Q${i + 1}`;
            if (a) {
              const prefix = a.custom ? "(wrote) " : "";
              addPrefixed(lines, " ", `${theme.fg("muted", `${label}: `)}${theme.fg("text", prefix + (a.answer || "(no input)"))}`, w);
            }
          }
          if (globalNote) addPrefixed(lines, " ", theme.fg("muted", `note: ${globalNote}`), w);
          lines.push("");
          if (allAnswered()) addPrefixed(lines, " ", theme.fg("success", "Press Enter to submit"), w);
          else {
            const missing = questions.map((x, i) => (answers.has(i) ? "" : x.header || `Q${i + 1}`)).filter(Boolean).join(", ");
            addPrefixed(lines, " ", theme.fg("warning", `Unanswered: ${missing}`), w);
          }
        } else if (question) {
          addPrefixed(lines, " ", theme.fg("text", question.question), w);
          lines.push("");
          const preview = optionIndex < question.options.length ? question.options[optionIndex].preview : undefined;
          const side = !!(preview && w >= PREVIEW_SIDE_MIN);
          if (side) {
            const leftW = Math.max(24, Math.floor(w * 0.42));
            const rightW = Math.max(20, w - leftW - 1);
            lines.push(...zip(renderOptions(question, leftW), renderPreview(preview!, rightW), leftW));
          } else {
            lines.push(...renderOptions(question, w));
            if (preview) {
              lines.push("");
              lines.push(...renderPreview(preview, w));
            }
          }
        }

        if (mode === "pick") {
          lines.push("");
          const help = submitTab
            ? "Enter submit • n note • Esc cancel"
            : isMulti
              ? "Tab/←→ • ↑↓ • Enter • Space multi • n note • Esc cancel"
              : "↑↓ • Enter • Space multi • n note • Esc cancel";
          addPrefixed(lines, " ", theme.fg("dim", help), w);
        }
        lines.push(theme.fg("accent", "─".repeat(w)));
        cached = lines;
        return lines;
      }

      return { render, invalidate: () => { cached = undefined; }, handleInput };
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "bottom-center",
        width: "100%",
        maxHeight: "100%",
        margin: { left: 0, right: 0, bottom: 0 },
      },
    },
  );
}
