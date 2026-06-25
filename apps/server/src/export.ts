const DIST = `${process.cwd()}/apps/web/dist`;

/**
 * Build a fully self-contained single-file HTML: the real Vue + ECharts dashboard
 * bundle inlined (CSS + JS), with the analysis data embedded as window.__SPOTILYZE__.
 * The app boots into an offline mode and recomputes timeframe slices client-side via
 * @spotilyze/core — so it looks and behaves like the live dashboard, with no server.
 */
export async function buildExportHtml(data: unknown): Promise<string> {
  let html = await Bun.file(`${DIST}/index.html`).text();
  const jsRef = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const cssRef = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  if (!jsRef) throw new Error("export: built JS not found — run `bun run build:web` first");

  const js = (await Bun.file(`${DIST}${jsRef}`).text()).replace(/<\/script>/gi, "<\\/script>");
  const css = cssRef ? await Bun.file(`${DIST}${cssRef}`).text() : "";
  // </ → <\/ keeps any artist/track name with "</script>" from closing the data tag early
  const payload = JSON.stringify(data).replace(/<\//g, "<\\/");

  // IMPORTANT: use function replacements — the JS/CSS/JSON contain `$` which a string
  // replacement would mangle as $&/$$ substitution patterns.
  html = html.replace(/<link rel="stylesheet"[^>]*>/i, () => `<style>${css}</style>`);
  html = html.replace(
    /<script type="module"[^>]*><\/script>/i,
    () => `<script>window.__SPOTILYZE__=${payload}</script>\n<script type="module">${js}</script>`,
  );
  return html;
}
