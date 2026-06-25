import type { WeightedGenre } from "./types";

export interface TagGenreMap {
  stoplist: string[];
  aliases: Record<string, string>;
}

export interface RawTag {
  name: string;
  count: number;
}

export interface NormalizeOpts {
  topK?: number; // keep at most N canonical genres per artist
  minCount?: number; // ignore tags weaker than this
}

export const normTag = (t: string): string => t.trim().toLowerCase();

/**
 * Normalize one raw genre tag → canonical genre, or null if dropped.
 * Drops: empty, tag equal to the artist name, stop-listed tags.
 */
export function canonicalGenre(
  rawTag: string,
  map: TagGenreMap,
  stop: Set<string>,
  artistLc?: string,
): string | null {
  const t = normTag(rawTag);
  if (!t) return null;
  if (artistLc && t === artistLc) return null;
  if (stop.has(t)) return null;
  return map.aliases[t] ?? t;
}

/**
 * Collapse an artist's raw genre tags into weighted canonical genres.
 * Weights are summed tag counts (0-100 scale); result sorted desc, capped at topK.
 * This is what gets written into the artist-genre cache.
 */
export function artistGenresFromTags(
  artist: string,
  rawTags: RawTag[],
  map: TagGenreMap,
  opts: NormalizeOpts = {},
): WeightedGenre[] {
  const stop = new Set(map.stoplist.map(normTag));
  const artistLc = normTag(artist);
  const minCount = opts.minCount ?? 1;
  const acc = new Map<string, number>();

  for (const { name, count } of rawTags) {
    if ((count ?? 0) < minCount) continue;
    const g = canonicalGenre(name, map, stop, artistLc);
    if (!g) continue;
    acc.set(g, (acc.get(g) ?? 0) + count);
  }

  const genres = [...acc.entries()]
    .map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight);

  return opts.topK ? genres.slice(0, opts.topK) : genres;
}
