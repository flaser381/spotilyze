// Tiny, dependency-free Markdown → HTML renderer for the AI report.
// Deliberately minimal (the LLM output is plain prose): headings, bold, italic,
// inline code, links, ordered/unordered lists, blockquotes, horizontal rules.
// All text is HTML-escaped before any tags are added, so model output can't inject markup.

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// private-use sentinels around code-span indices — won't occur in escaped text,
// so they can't collide with plain numbers in the prose (e.g. "in 2017").
const C0 = "";
const C1 = "";

/** Inline formatting on already-escaped text. */
function inline(text: string): string {
  // protect `code` spans from further parsing
  const codes: string[] = [];
  let t = text.replace(/`([^`]+)`/g, (_m, c: string) => C0 + (codes.push(c) - 1) + C1);
  // [label](url)
  t = t.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, url: string) => `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">${label}</a>`,
  );
  // **bold** / __bold__
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // *italic* / _italic_  (avoid eating the bold markers handled above)
  t = t.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\s][^_]*?)_/g, "$1<em>$2</em>");
  // restore code spans
  t = t.replace(new RegExp(C0 + "(\\d+)" + C1, "g"), (_m, i: string) => `<code>${codes[+i]}</code>`);
  return t;
}

/** Block-level render. Returns an HTML string safe to inject via v-html. */
export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] | null = null;

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(esc(para.join(" ")))}</p>`); para = []; } };
  const flushList = () => {
    if (list) { out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(esc(i))}</li>`).join("")}</${list.type}>`); list = null; }
  };
  const flushQuote = () => { if (quote) { out.push(`<blockquote>${inline(esc(quote.join(" ")))}</blockquote>`); quote = null; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushAll(); continue; }

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushAll();
      const lvl = m[1]!.length;
      out.push(`<h${lvl}>${inline(esc(m[2]!))}</h${lvl}>`);
    } else if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushAll();
      out.push("<hr/>");
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList();
      (quote ??= []).push(m[1]!);
    } else if ((m = line.match(/^[-*+]\s+(.*)$/))) {
      flushPara(); flushQuote();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(m[1]!);
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      flushPara(); flushQuote();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(m[1]!);
    } else {
      flushList(); flushQuote();
      para.push(line);
    }
  }
  flushAll();
  return out.join("\n");
}
