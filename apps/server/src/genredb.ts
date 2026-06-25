import { Database } from "bun:sqlite";
import type { GenreAVDTable } from "@spotilyze/core";

/**
 * Load the genre→AVD table from the shipped DB's genre_avd table into a plain map
 * (the core analysis expects a GenreAVDTable object). Read once at startup.
 */
export function loadGenreAvd(path: string): GenreAVDTable {
  const table: GenreAVDTable = {};
  try {
    const db = new Database(path, { readonly: true });
    for (const r of db.query("SELECT genre, a, v, d FROM genre_avd").all() as { genre: string; a: number; v: number; d: number }[]) {
      table[r.genre] = { a: r.a, v: r.v, d: r.d };
    }
    db.close();
  } catch {
    /* DB or table missing → empty table (genre derivation yields nothing) */
  }
  return table;
}
