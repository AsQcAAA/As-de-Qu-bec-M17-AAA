// Lecture directe (sans IA) du calendrier M17 AAA de la LHEQ, exporté en PDF :
// une ligne par match (date, heure, endroit, visiteur, score, local).
//
// Les noms d'équipe longs passent sur deux lignes dans le PDF et leur texte se
// mélange à celui des lignes voisines : on ne peut donc pas lire ligne par
// ligne. On s'appuie sur les colonnes — chaque fragment de texte porte sa
// position (x, y) — et on rattache à chaque match les fragments des colonnes
// « Visiteur », « Score » et « Local » situés dans la même bande verticale.
//
// N'est importé que par la route API : pdfjs-dist n'a rien à faire dans le
// bundle du navigateur.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { OPPONENT_TEAMS } from "./lheqTeams";

export interface LeagueGame {
  date: string; // yyyy-MM-dd
  home: string; // slug
  away: string; // slug
  homeScore: number | null;
  awayScore: number | null;
}

const MONTHS: Record<string, number> = {
  janv: 1, fevr: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, sept: 9, oct: 10, nov: 11, dec: 12,
};

const KEYWORDS: [string, string][] = [
  ["rousseau", "rousseau-royal-lav-mtl"],
  ["select", "select-du-nord"],
  ["senateur", "senateurs-out"],
  ["estacade", "estacades-mauricie"],
  ["gaulois", "gaulois-ric"],
  ["canam", "canam-ba"],
  ["blizzard", "blizzard-ssf"],
  ["corsaire", "corsaires-pointe-levy"],
  ["asquebec", "as-de-quebec"],
  ["grenadier", "grenadiers-lsl"],
  ["dynamique", "dynamiques-ccl"],
  ["conquerant", "conquerants-bl"],
  ["pionnier", "pionniers-lan"],
  ["citadelle", "citadelles-rn"],
  ["lion", "lions-lsl"],
  ["seigneur", "seigneurs-mi"],
  ["piche", "piche"],
  ["albatros", "albatros"],
  ["harfang", "harfangs-sherbrooke"],
  ["espoir", "espoirs-sag-lsj"],
];

function letters(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function teamSlug(raw: string): string | null {
  const n = letters(raw);
  if (!n) return null;
  const hit = KEYWORDS.find(([k]) => n.includes(k));
  return hit ? hit[1] : null;
}

interface Item {
  str: string;
  x: number;
  y: number;
}

// Positions des colonnes (PDF A4 portrait, 842 pt de large).
const COL_DATE_MAX = 100;
const COL_VISITOR = [480, 640] as const;
const COL_SCORE = [640, 678] as const;
const COL_HOME_MIN = 678;

export async function parseLeagueSchedulePdf(bytes: Uint8Array): Promise<LeagueGame[]> {
  const doc = await getDocument({ data: bytes }).promise;
  const games: LeagueGame[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      items.push({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] });
    }

    // Ancres : le jour du mois, dans la colonne « Date ».
    const anchors = items
      .filter((i) => i.x >= 60 && i.x <= 76 && /^\d{1,2}$/.test(i.str))
      .sort((a, b) => b.y - a.y);

    anchors.forEach((a, idx) => {
      const above = idx > 0 ? (anchors[idx - 1].y + a.y) / 2 : a.y + 20;
      const below = idx < anchors.length - 1 ? (anchors[idx + 1].y + a.y) / 2 : a.y - 20;
      const band = items.filter((i) => i.y <= above && i.y > below);

      const dateParts = band
        .filter((i) => i.x >= 60 && i.x <= COL_DATE_MAX + 40 && i.x < 140)
        .sort((x, y) => x.x - y.x)
        .map((i) => i.str);
      const month = dateParts.map((s) => MONTHS[letters(s).slice(0, 4)] ?? MONTHS[letters(s).slice(0, 3)]).find(Boolean);
      const year = dateParts.join(" ").match(/20\d{2}/)?.[0];
      if (!month || !year) return;

      const column = (min: number, max: number) =>
        band
          .filter((i) => i.x >= min && i.x < max)
          .sort((x, y) => y.y - x.y || x.x - y.x)
          .map((i) => i.str)
          .join(" ");

      const away = teamSlug(column(COL_VISITOR[0], COL_VISITOR[1]));
      const home = teamSlug(column(COL_HOME_MIN, 9999));
      if (!away || !home) return;

      const scoreText = column(COL_SCORE[0], COL_SCORE[1]);
      const m = scoreText.match(/(\d+)\s*-\s*(\d+)/);
      games.push({
        date: `${year}-${String(month).padStart(2, "0")}-${a.str.padStart(2, "0")}`,
        away,
        home,
        awayScore: m ? Number(m[1]) : null,
        homeScore: m ? Number(m[2]) : null,
      });
    });
  }
  return games;
}

export interface TeamRecord {
  slug: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  /** Chronologique, du plus ancien au plus récent : V, D ou N. */
  results: ("V" | "D" | "N")[];
}

/** Fiche de chaque équipe d'après les matchs déjà joués (score connu). */
export function computeRecords(games: LeagueGame[]): TeamRecord[] {
  const byTeam = new Map<string, TeamRecord>();
  for (const t of OPPONENT_TEAMS) byTeam.set(t.slug, { slug: t.slug, name: t.name, wins: 0, losses: 0, ties: 0, results: [] });
  const played = games
    .filter((g) => g.homeScore != null && g.awayScore != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const apply = (slug: string, own: number, other: number) => {
    const rec = byTeam.get(slug);
    if (!rec) return;
    if (own > other) {
      rec.wins++;
      rec.results.push("V");
    } else if (own < other) {
      rec.losses++;
      rec.results.push("D");
    } else {
      rec.ties++;
      rec.results.push("N");
    }
  };
  for (const g of played) {
    apply(g.home, g.homeScore!, g.awayScore!);
    apply(g.away, g.awayScore!, g.homeScore!);
  }
  return [...byTeam.values()];
}
