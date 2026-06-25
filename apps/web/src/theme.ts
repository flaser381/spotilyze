// AVD axis colors (consistent everywhere)
export const AVD = { a: "#ff6b6b", v: "#1ed793", d: "#5c8cff" } as const;
export const AVD_LABEL = { a: "Arousal", v: "Valence", d: "Depth" } as const;

// genre / categorical palette
export const PALETTE = [
  "#7c5cff", "#1ed793", "#ff6b6b", "#5c8cff", "#ffb454",
  "#ff5c9d", "#34d6e6", "#b18cff", "#9ad84a", "#ff8a5c",
];

export const fmtMonth = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short" });
export const fmtDay = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export const fmtHours = (h: number) => (h >= 1 ? `${Math.round(h)}h` : `${Math.round(h * 60)}m`);
export const fmtNum = (n: number) => n.toLocaleString();

// shared dark chart base
export const CHART_BG = "transparent";
export const grid = (over: Record<string, unknown> = {}) => ({
  left: 8, right: 12, top: 16, bottom: 8, containLabel: true, ...over,
});
export const axisStyle = {
  axisLine: { lineStyle: { color: "#2a3040" } },
  axisLabel: { color: "#8a91a6", fontSize: 11 },
  splitLine: { lineStyle: { color: "#1c2230" } },
};
export const tooltip = {
  backgroundColor: "#11151f",
  borderColor: "#2a3040",
  textStyle: { color: "#e6e9f0", fontSize: 12 },
};

// scroll-wheel zoom + drag-pan on the x-axis; double-click chart to reset
export const zoom = () => [
  { type: "inside", zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false, filterMode: "none" },
];
