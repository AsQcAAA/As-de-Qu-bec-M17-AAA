// Synchronisation des tests physiques depuis le fichier Excel partagé sur Google
// Drive (onglet « M17 »). Le fichier est lu par son lien de partage public ;
// rien n'est jamais écrasé : on n'ajoute que les résultats absents de l'app
// (ce qui est déjà dans l'app fait foi).
//
// L'onglet empile plusieurs tableaux, chacun précédé d'une ligne d'en-tête dont
// la première cellule est « Nom » : le premier est la séance de cette année
// (A26), le deuxième celle de la fin de la saison 2025-26 (P26, printemps 2026). Les colonnes sont repérées par
// leur titre, pas par leur position, donc l'ajout d'un test ou d'une colonne
// ne casse rien.

import type { SupabaseClient } from "@supabase/supabase-js";

export const TESTS_SHEET_ID = process.env.TESTS_SHEET_ID || "10WpjPYPFdp0iRFbCFTk6ZgrCHPonlsi2";
const SHEET_TAB = "M17";

/** Séance de chaque tableau, dans l'ordre où ils apparaissent dans l'onglet. */
const BLOCK_DATES = ["2026-09-08", "2026-05-01"];

const TEST_DEFS: Record<string, { unit: string | null; higherIsBetter: boolean; min: number; max: number }> = {
  "Saut horizontal": { unit: "cm", higherIsBetter: true, min: 120, max: 330 },
  "Lancer de ballon": { unit: "cm", higherIsBetter: true, min: 150, max: 800 },
  "Chin up": { unit: null, higherIsBetter: true, min: 0, max: 45 },
  "Bench press @ 75% BW": { unit: null, higherIsBetter: true, min: 0, max: 60 },
  "Grandeur assise": { unit: "po", higherIsBetter: true, min: 25, max: 45 },
  "Agilité 5-10-5 R": { unit: "s", higherIsBetter: false, min: 4, max: 8 },
  "Agilité 5-10-5 L": { unit: "s", higherIsBetter: false, min: 4, max: 8 },
  "Sprint 30 m (1)": { unit: "s", higherIsBetter: false, min: 3.5, max: 7 },
  "Sprint 30 m (2)": { unit: "s", higherIsBetter: false, min: 3.5, max: 7 },
  "Pallier 30-15": { unit: null, higherIsBetter: true, min: 8, max: 26 },
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellValue(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return o.result;
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return o.text;
  }
  return v;
}

function toNumber(v: unknown): number | null {
  const raw = cellValue(v);
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const n = Number(String(raw).replace(/\*/g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

type Column = { test: string; index: number };

/** Associe chaque colonne d'un en-tête à un test (les colonnes sans titre reconnu sont ignorées). */
function mapColumns(header: string[]): { columns: Column[]; sautIndex: number } {
  const cols: Column[] = [];
  let sprintGroup = 0;
  const hasNumberedSprints = header.some((h) => /^sprint [12]$/.test(norm(h)));
  header.forEach((h, index) => {
    const n = norm(h);
    if (!n || n === "nom") return;
    if (n.startsWith("saut horizontal")) cols.push({ test: "Saut horizontal", index });
    else if (n.startsWith("lancer")) cols.push({ test: "Lancer de ballon", index });
    else if (n === "chin up") cols.push({ test: "Chin up", index });
    else if (n.startsWith("bench press")) cols.push({ test: "Bench press @ 75% BW", index });
    else if (n.includes("assise")) cols.push({ test: "Grandeur assise", index });
    else if (n.startsWith("agilite 5 10 5 r")) cols.push({ test: "Agilité 5-10-5 R", index });
    else if (n.startsWith("agilite 5 10 5 l")) cols.push({ test: "Agilité 5-10-5 L", index });
    else if (n === "30 15") cols.push({ test: "Pallier 30-15", index });
    else if (n === "sprint 1") cols.push({ test: "Sprint 30 m (1)", index });
    else if (n === "sprint 2") cols.push({ test: "Sprint 30 m (2)", index });
    else if (n.startsWith("sprint 30m") && !hasNumberedSprints) {
      // Sans « Sprint 1/2 » : les colonnes « Sprint (30m) » sont les moyennes des deux séries.
      sprintGroup += 1;
      if (sprintGroup <= 2) cols.push({ test: sprintGroup === 1 ? "Sprint 30 m (1)" : "Sprint 30 m (2)", index });
    }
  });
  return { columns: cols, sautIndex: header.findIndex((h) => norm(h).startsWith("saut horizontal")) };
}

export interface ParsedResult {
  name: string;
  test: string;
  date: string;
  value: number;
  note: string | null;
}

/**
 * Disposition des joueurs de 2e année pour la séance P26 (fin de la saison 2025-26), sans
 * titres de colonnes : Nom, Poids, Taille, Grandeur assise, Saut horizontal
 * (2 essais, on garde le meilleur), Lancer de ballon (cm), Chin up, Agilité R
 * (2 essais), Agilité L (2 essais), Sprint 30 m (1), Sprint 30 m (2), 30-15.
 */
function parseSecondYearRow(name: string, cells: unknown[], date: string): ParsedResult[] {
  // Excel transforme parfois « 05.05 » en date (5 mai) : on la relit comme 5,05 s.
  const n = (i: number) => {
    const raw = cellValue(cells[i]);
    if (raw instanceof Date) return raw.getUTCMonth() + 1 + raw.getUTCDate() / 100;
    return toNumber(raw);
  };
  const ok = (test: string, v: number | null) => v !== null && v >= TEST_DEFS[test].min && v <= TEST_DEFS[test].max;
  const best = (test: string, values: (number | null)[], pick: "min" | "max") => {
    const valid = values.filter((v): v is number => ok(test, v));
    return valid.length ? (pick === "max" ? Math.max(...valid) : Math.min(...valid)) : null;
  };
  const found: [string, number | null][] = [
    ["Grandeur assise", n(3)],
    ["Saut horizontal", best("Saut horizontal", [n(4), n(5)], "max")],
    ["Lancer de ballon", n(6)],
    ["Chin up", n(7)],
    ["Agilité 5-10-5 R", best("Agilité 5-10-5 R", [n(8), n(9)], "min")],
    ["Agilité 5-10-5 L", best("Agilité 5-10-5 L", [n(10), n(11)], "min")],
    ["Sprint 30 m (1)", n(12)],
    ["Sprint 30 m (2)", n(13)],
    ["Pallier 30-15", n(14)],
  ];
  return found.filter(([test, v]) => ok(test, v)).map(([test, value]) => ({ name, test, date, value: value as number, note: null }));
}

/** Lit l'onglet M17 : une liste de résultats (joueur, test, séance, valeur). */
export async function parseTestsWorkbook(buffer: ArrayBuffer): Promise<ParsedResult[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find((w) => w.name.trim().toUpperCase() === SHEET_TAB) ?? null;
  if (!ws) throw new Error(`Onglet « ${SHEET_TAB} » introuvable dans le fichier.`);

  const out: ParsedResult[] = [];
  let blockIndex = -1;
  let columns: Column[] = [];
  let sautIndex = -1;

  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells = (row.values as unknown[]).slice(1);
    const first = String(cellValue(cells[0]) ?? "").trim();
    if (norm(first) === "nom") {
      blockIndex += 1;
      const header = cells.map((c) => String(cellValue(c) ?? ""));
      ({ columns, sautIndex } = mapColumns(header));
      return;
    }
    const date = BLOCK_DATES[blockIndex];
    if (!date || !first) return;

    // Une ligne dont le saut horizontal est hors de la plage plausible n'a pas la
    // disposition du tableau. Quand on y trouve une grandeur assise (25-45 po) à la
    // place du saut, c'est la disposition « 2e année » de l'an dernier (voir
    // parseSecondYearRow) ; toute autre anomalie est ignorée plutôt que de ranger
    // des valeurs dans les mauvaises colonnes.
    if (sautIndex >= 0) {
      const saut = toNumber(cells[sautIndex]);
      if (saut !== null && (saut < TEST_DEFS["Saut horizontal"].min || saut > TEST_DEFS["Saut horizontal"].max)) {
        if (date === BLOCK_DATES[1] && saut >= 25 && saut <= 45) out.push(...parseSecondYearRow(first, cells, date));
        return;
      }
    }

    // Agilités : deux essais par côté, on retient le meilleur (le plus petit temps).
    const agility = new Map<string, number[]>();
    for (const c of columns) {
      const def = TEST_DEFS[c.test];
      const raw = cellValue(cells[c.index]);
      const value = toNumber(raw);
      if (value === null || value < def.min || value > def.max) continue;
      if (c.test.startsWith("Agilité")) {
        agility.set(c.test, [...(agility.get(c.test) ?? []), value]);
        continue;
      }
      const starred = typeof raw === "string" && raw.includes("*");
      out.push({ name: first, test: c.test, date, value, note: starred ? "Astérisque (*) dans le fichier d'origine" : null });
    }
    for (const [test, values] of agility) out.push({ name: first, test, date, value: Math.min(...values), note: null });
  });
  return out;
}

/** Associe un nom du fichier à un joueur de l'alignement (actif, hors remplaçants). */
function matcher(players: { id: string; full_name: string }[]) {
  const byFull = new Map(players.map((p) => [norm(p.full_name), p.id]));
  const lastOf = (n: string) => n.split(" ").slice(-1)[0];
  const aliases: Record<string, string> = { "yann emmnauel mombo": "yann emmanuel mombo" };
  return (raw: string): string | null => {
    let n = norm(raw);
    n = aliases[n] ?? n;
    if (byFull.has(n)) return byFull.get(n)!;
    // Même nom de famille et même initiale du prénom (fautes d'orthographe du prénom).
    const cands = players.filter((p) => lastOf(norm(p.full_name)) === lastOf(n) && norm(p.full_name)[0] === n[0]);
    return cands.length === 1 ? cands[0].id : null;
  };
}

export interface SyncSummary {
  inserted: number;
  alreadyThere: number;
  unmatched: string[];
  perTest: Record<string, number>;
}

/** Télécharge le fichier, lit l'onglet M17 et ajoute les résultats manquants (jamais d'écrasement). */
export async function syncTestsFromSheet(supabase: SupabaseClient): Promise<SyncSummary> {
  const res = await fetch(`https://drive.google.com/uc?export=download&id=${TESTS_SHEET_ID}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}) — le fichier est-il toujours partagé par lien ?`);
  const parsed = await parseTestsWorkbook(await res.arrayBuffer());

  const [{ data: players }, { data: existing }] = await Promise.all([
    supabase.from("players").select("id, full_name").eq("active", true).eq("is_call_up", false),
    supabase.from("player_test_results").select("player_id, test_name, test_date").limit(10000),
  ]);
  const findPlayer = matcher((players ?? []) as { id: string; full_name: string }[]);
  const have = new Set((existing ?? []).map((e) => `${e.player_id}|${e.test_name}|${e.test_date}`));
  const sessionNotes: Record<string, string> = {
    "2026-05-01": "Tests de fin de saison 2025-26 — printemps 2026 (date exacte non précisée)",
  };

  const unmatched = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  let already = 0;
  const perTest: Record<string, number> = {};
  for (const r of parsed) {
    const playerId = findPlayer(r.name);
    if (!playerId) {
      unmatched.add(r.name);
      continue;
    }
    const key = `${playerId}|${r.test}|${r.date}`;
    if (have.has(key)) {
      already++;
      continue;
    }
    have.add(key);
    const def = TEST_DEFS[r.test];
    rows.push({
      player_id: playerId,
      test_name: r.test,
      value: r.value,
      unit: def.unit,
      higher_is_better: def.higherIsBetter,
      test_date: r.date,
      notes: r.note ?? sessionNotes[r.date] ?? null,
    });
    perTest[r.test] = (perTest[r.test] ?? 0) + 1;
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("player_test_results").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { inserted: rows.length, alreadyThere: already, unmatched: [...unmatched].sort(), perTest };
}
