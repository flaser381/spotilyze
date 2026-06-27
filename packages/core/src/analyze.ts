import { avdCoverage } from "./avd";
import { detectLifePhases, type LifePhaseOpts } from "./lifephases";
import { computeWidgets } from "./metrics";
import type { SkipEvent } from "./parse";
import { computeSignals, type SignalOpts } from "./signals";
import type { AnalysisResult, ArtistGenreMap, GenreAVDTable, Play } from "./types";

export interface AnalyzeOpts {
  signals?: SignalOpts;
  topN?: number;
  streamGenres?: number;
  phases?: LifePhaseOpts;
  skips?: SkipEvent[]; // sub-30s fast-skips — folded into the restlessness metric (else heavy skippers look patient)
}

/**
 * Full headless analysis: Play[] + resolved genres + AVD table → AnalysisResult.
 * Pure. boundaries/phases are filled by the M3 change-point engine.
 */
export function analyze(
  plays: Play[],
  amap: ArtistGenreMap,
  table: GenreAVDTable,
  opts: AnalyzeOpts = {},
): AnalysisResult {
  const widgets = computeWidgets(plays, amap, table, { topN: opts.topN, streamGenres: opts.streamGenres, skips: opts.skips });
  const signals = computeSignals(plays, amap, table, opts.signals);
  const cov = avdCoverage(plays, amap, table);
  const { boundaries, phases } = detectLifePhases(plays, signals, amap, table, opts.phases);

  return {
    meta: {
      span: widgets.summary.span,
      totalPlays: widgets.summary.totalPlays,
      totalHours: widgets.summary.totalHours,
      nArtists: widgets.summary.nArtists,
      nTracks: widgets.summary.nTracks,
      unresolvedGenreShare: 1 - cov.share,
    },
    signals,
    boundaries,
    phases,
    widgets,
  };
}
