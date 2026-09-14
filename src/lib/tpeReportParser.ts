// Lecture directe (sans IA) du rapport de statistiques avancées TPE
// (portal.tpeteam.com), en PDF.
//
// Contrairement à la feuille de match officielle, ce PDF n'a pas de champs de
// formulaire : c'est du texte positionné sur la page, comme n'importe quel
// PDF « imprimé » depuis une page web. On peut quand même le lire sans IA en
// reconstituant les lignes du tableau à partir des coordonnées (x, y) de
// chaque fragment de texte — la même idée qu'un `pdftotext -layout`.
//
// Portée volontairement limitée à ce qui se lit de façon fiable :
//  - le tableau « Player stats » (une ligne par joueur, largeur pleine page,
//    jamais mélangé à autre chose) — la donnée qui compte le plus.
//  - les tableaux « Shots and goals scored » et « Face-Offs » de la colonne
//    de gauche, en excluant la colonne « Leaders » et le diagramme de tirs
//    (aucune coordonnée de tir exploitable là-dedans, seulement des
//    étiquettes posées sur un dessin).
//
// N'est importé que par la route API (jamais par un composant client) :
// pdfjs-dist et le contenu du PDF n'ont rien à faire dans le bundle navigateur.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  ParsedAdvancedReport,
  TpeFaceoffBreakdown,
  TpeFaceoffLine,
  TpeFaceoffZoneGrid,
  TpePlayerLine,
  TpeShotsBreakdown,
  TpeShotsLine,
} from "./tpeReport";
import { toiToSeconds } from "./tpeReport";

const AS_QUEBEC_PATTERNS = ["QUEBEC AS", "AS QUEBEC", "AS DE QUEBEC"];

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isAsQuebec(name: string): boolean {
  const n = normalize(name);
  return AS_QUEBEC_PATTERNS.some((p) => n.includes(p));
}

interface TextItem {
  str: string;
  x: number;
  y: number;
}

interface Line {
  y: number;
  text: string;
}

function itemsOf(content: { items: unknown[] }): TextItem[] {
  return (content.items as { str?: string; transform: number[] }[])
    .filter((it) => it.str && it.str.trim() !== "")
    .map((it) => ({ str: it.str as string, x: it.transform[4], y: it.transform[5] }));
}

/** Regroupe les fragments de texte en lignes, par coordonnée y (tolérance 0,5pt). */
function groupLines(items: TextItem[]): Line[] {
  const rows = new Map<number, TextItem[]>();
  for (const it of items) {
    const y = Math.round(it.y * 2) / 2;
    const arr = rows.get(y) ?? [];
    arr.push(it);
    rows.set(y, arr);
  }
  return [...rows.keys()]
    .sort((a, b) => b - a)
    .map((y) => ({
      y,
      text: rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    }));
}

// Un token de statistique est un entier (positif ou négatif), un nombre
// décimal, "_" (valeur absente sur le rapport) ou un temps "mm:ss".
const STAT_TOKEN = /^(-?\d+(\.\d+)?|_|\d{1,3}:\d{2})$/;
// Nombre de colonnes après le nom : B, A, PTS, +/-, TOI, Présences, Tirs
// tentés, Tirs au but, Tirs zone dangereuse, Tirs bloqués (nous), Mises en
// échec données, Mises en échec reçues, MAJ gagnées, MAJ perdues, MAJ %,
// xG sur glace pour, xG sur glace contre, xG/20 pour, xG/20 contre, xG, xG/20.
const STAT_COLUMN_COUNT = 22;

function parsePlayerRow(line: string): TpePlayerLine | null {
  const tokens = line.split(" ").filter(Boolean);
  if (tokens.length < 1 + 1 + STAT_COLUMN_COUNT) return null;
  const jersey = Number(tokens[0]);
  if (!Number.isInteger(jersey)) return null;
  const stats = tokens.slice(tokens.length - STAT_COLUMN_COUNT);
  if (!stats.every((t) => STAT_TOKEN.test(t))) return null;
  const nameTokens = tokens.slice(1, tokens.length - STAT_COLUMN_COUNT);
  if (nameTokens.length === 0) return null;
  const sheetName = nameTokens.join(" ");

  const num = (s: string): number | null => (s === "_" ? null : Number(s));
  const [
    ,
    ,
    ,
    plusMinus,
    toi,
    ,
    ,
    shotsOnGoal,
    ,
    ,
    ,
    ,
    ,
    faceoffsWon,
    faceoffsLost,
    ,
    onIceXgFor,
    onIceXgAgainst,
    onIceXgForPer20,
    onIceXgAgainstPer20,
    xg,
    // Colonne "Xg per 20" du rapport ignorée : elle reprend presque toujours
    // la même valeur que "Xg" telle quelle sur le PDF (repéré sur plusieurs
    // joueurs d'un même match) — visiblement pas normalisée par TPE côté xG
    // individuel, contrairement aux colonnes "on ice". On la recalcule donc
    // nous-mêmes ci-dessous à partir du xG et du temps de jeu réels.
    ,
  ] = stats;

  const toiSeconds = toiToSeconds(toi);
  const xgValue = num(xg);
  // Deux décimales plutôt qu'une : au dixième, un TOI proche de 20 minutes
  // écrasait presque toute variation entre joueurs.
  const xgPer20 = xgValue != null && toiSeconds ? Math.round((xgValue * 1200) / toiSeconds * 100) / 100 : null;

  return {
    jersey,
    sheetName,
    toiSeconds,
    shotsOnGoal: num(shotsOnGoal),
    faceoffsWon: num(faceoffsWon),
    faceoffsLost: num(faceoffsLost),
    plusMinus: num(plusMinus),
    onIceXgFor: num(onIceXgFor),
    onIceXgAgainst: num(onIceXgAgainst),
    onIceXgForPer20: num(onIceXgForPer20),
    onIceXgAgainstPer20: num(onIceXgAgainstPer20),
    xg: xgValue,
    xgPer20,
  };
}

/** "41/41/5" → {shotAttempts:41, shotsOnGoal:41, goals:5}. */
function parseShotsCell(cell: string): TpeShotsLine | null {
  const m = cell.match(/^(\d+)\/(\d+)\/(\d+)$/);
  if (!m) return null;
  return { shotAttempts: Number(m[1]), shotsOnGoal: Number(m[2]), goals: Number(m[3]) };
}

/** "36 62.1% 22 37.9%" → nous 36 gagnées, eux 22 (nos pertes). */
function parseFaceoffLine(line: string, ourFirst: boolean): TpeFaceoffLine | null {
  const nums = line.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 4) return null;
  // nums = [ourWon, ourPct, theirWon, theirPct] ou l'inverse selon l'ordre des colonnes.
  const won = ourFirst ? Number(nums[0]) : Number(nums[2]);
  const lost = ourFirst ? Number(nums[2]) : Number(nums[0]);
  return { won, lost };
}

/**
 * Le diagramme « Face-Offs by zones » — 9 ronds de mise au jeu dessinés sur
 * une patinoire, chacun deux fragments de texte empilés (pourcentage au-dessus
 * du compte "gagnées / perdues"), plus une case "TOTAL" à part. Rien de tout
 * ça n'est un tableau : on retrouve chaque rond par sa position (x, y).
 */
function parseFaceoffZoneDiagram(items: TextItem[], titleY: number, pageWidth: number): TpeFaceoffZoneGrid | null {
  // Bande verticale sous le titre, au centre de la page — exclut la table de
  // gauche (« Face-Offs ») et la colonne des meneurs à droite.
  const band = items.filter((it) => it.x > pageWidth * 0.34 && it.x < pageWidth * 0.66 && it.y <= titleY + 2 && it.y > titleY - 100);
  const pctItems = band.filter((it) => /^\d+(\.\d+)?%$/.test(it.str));
  const countItems = band.filter((it) => /^\d+\s*\/\s*\d+$/.test(it.str));
  const totalLabel = band.find((it) => it.str === "TOTAL");

  // Le compte d'un rond est juste sous son pourcentage, à la même abscisse.
  function nearestCount(p: TextItem): TextItem | null {
    let best: TextItem | null = null;
    let bestDy = Infinity;
    for (const c of countItems) {
      if (Math.abs(c.x - p.x) > 8) continue;
      const dy = p.y - c.y;
      if (dy < 0 || dy > 12) continue;
      if (dy < bestDy) {
        bestDy = dy;
        best = c;
      }
    }
    return best;
  }

  function readLine(p: TextItem): TpeFaceoffLine | null {
    const c = nearestCount(p);
    if (!c) return null;
    const m = c.str.match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { won: Number(m[1]), lost: Number(m[2]) } : null;
  }

  // La case "TOTAL" partage l'abscisse du rond central mais siège bien plus
  // haut : on l'identifie par sa proximité au mot "TOTAL" pour ne jamais la
  // confondre avec le rond du centre de la patinoire.
  let totalPct: TextItem | undefined;
  if (totalLabel) {
    totalPct = pctItems.find((p) => Math.abs(p.x - totalLabel.x) < 8 && totalLabel.y - p.y > 0 && totalLabel.y - p.y < 15);
  }

  type Dot = { x: number; y: number; won: number; lost: number };
  const dots: Dot[] = pctItems
    .filter((p) => p !== totalPct)
    .map((p): Dot | null => {
      const line = readLine(p);
      return line ? { x: p.x, y: p.y, ...line } : null;
    })
    .filter((d): d is Dot => d !== null);

  if (dots.length !== 9) return null;

  // 5 colonnes de gauche à droite : zone défensive, zone neutre (côté
  // défensif), centre, zone neutre (côté offensif), zone offensive. On les
  // retrouve en regroupant les abscisses par proximité (~15pt), pas par une
  // valeur fixe — la mise en page peut décaler légèrement d'un rapport à l'autre.
  const sortedByX = [...dots].sort((a, b) => a.x - b.x);
  const columns: Dot[][] = [];
  for (const d of sortedByX) {
    const last = columns[columns.length - 1];
    if (last && d.x - last[last.length - 1].x < 15) last.push(d);
    else columns.push([d]);
  }
  if (columns.length !== 5 || columns[2].length !== 1 || columns.some((c, i) => i !== 2 && c.length !== 2)) {
    return null;
  }

  const [dzCol, nzDefCol, centerCol, nzOffCol, ozCol] = columns;
  const byRow = (col: Dot[]) => [...col].sort((a, b) => b.y - a.y); // haut d'abord

  const [dzTop, dzBottom] = byRow(dzCol);
  const [nzDefTop, nzDefBottom] = byRow(nzDefCol);
  const [nzOffTop, nzOffBottom] = byRow(nzOffCol);
  const [ozTop, ozBottom] = byRow(ozCol);

  const line = ({ won, lost }: Dot): TpeFaceoffLine => ({ won, lost });

  return {
    dzTop: line(dzTop),
    dzBottom: line(dzBottom),
    nzDefTop: line(nzDefTop),
    nzDefBottom: line(nzDefBottom),
    center: line(centerCol[0]),
    nzOffTop: line(nzOffTop),
    nzOffBottom: line(nzOffBottom),
    ozTop: line(ozTop),
    ozBottom: line(ozBottom),
  };
}

export async function parseTpeReportPdf(bytes: Uint8Array): Promise<ParsedAdvancedReport> {
  const warnings: string[] = [];
  // Extraction de texte pur : pas de rendu, donc pas besoin des polices
  // système ni d'un worker — les deux ont posé problème une fois empaquetés
  // par Next.js (pdfjs-dist n'est pas pensé pour un bundler côté serveur).
  const doc = await getDocument({ data: bytes, disableFontFace: true, isEvalSupported: false }).promise;

  let ourTeamName: string | null = null;
  let opponentName: string | null = null;
  let players: TpePlayerLine[] = [];
  let shots: TpeShotsBreakdown | null = null;
  let faceoffs: TpeFaceoffBreakdown | null = null;
  let faceoffZones: TpeFaceoffZoneGrid | null = null;
  let teamXgUs: number | null = null;
  let teamXgOpponent: number | null = null;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = itemsOf(content);
    const lines = groupLines(items).map((l) => l.text);
    const pageText = lines.join(" ");

    // ---- Tableau « Player stats » : une section par équipe. ----
    if (pageText.includes("Player stats -")) {
      const headerIdxs: { idx: number; name: string }[] = [];
      lines.forEach((l, idx) => {
        const m = l.match(/^Player stats - (.+)$/);
        if (m) headerIdxs.push({ idx, name: m[1].trim() });
      });
      for (let h = 0; h < headerIdxs.length; h++) {
        const { idx, name } = headerIdxs[h];
        const end = h + 1 < headerIdxs.length ? headerIdxs[h + 1].idx : lines.length;
        const rows = lines.slice(idx + 1, end).map(parsePlayerRow).filter((r): r is TpePlayerLine => r !== null);
        if (isAsQuebec(name)) {
          ourTeamName = name;
          players = rows;
        } else {
          opponentName = name;
        }
      }
    }

    // ---- Tableaux « Shots and goals scored » et « Face-Offs » (colonne de
    // gauche seulement — la colonne « Leaders » et le diagramme de tirs, au
    // centre et à droite de la page, n'ont rien d'exploitable ici). ----
    if (pageText.includes("Shots and goals scored") || pageText.includes("Face-Offs")) {
      const pageWidth = page.view[2] - page.view[0];
      const leftItems = items.filter((it) => it.x < pageWidth * 0.34);
      const leftLines = groupLines(leftItems).map((l) => l.text);

      const shotsTitleIdx = leftLines.findIndex((l) => l === "Shots and goals scored");
      if (shotsTitleIdx >= 0) {
        const headerLine = leftLines[shotsTitleIdx + 1]; // "QA17 PLC17"
        const abbrs = headerLine?.split(" ").filter(Boolean) ?? [];
        const ourFirst = abbrs.length === 2 ? normalize(abbrs[0]).startsWith("QA") : true;
        if (abbrs.length !== 2 || (!normalize(abbrs[0]).startsWith("QA") && !normalize(abbrs[1]).startsWith("QA"))) {
          warnings.push("Impossible de confirmer quelle colonne (gauche/droite) est celle des As de Québec pour les tirs — vérifie les totaux d'équipe.");
        }
        // 7 lignes de valeurs attendues, une pour chaque ligne du tableau
        // (total, 3 périodes, AN, DN, égalité), chacune suivie de son
        // étiquette — l'ordre est fixe, seule la valeur nous intéresse.
        const valueLines: string[] = [];
        for (let i = shotsTitleIdx + 2; i < leftLines.length && valueLines.length < 7; i += 2) {
          valueLines.push(leftLines[i]);
        }
        const cells = ["total", "p1", "p2", "p3", "pp", "pk", "even"] as const;
        if (valueLines.length === 7) {
          const us: Partial<TpeShotsBreakdown["us"]> = {};
          const opp: Partial<TpeShotsBreakdown["opponent"]> = {};
          let ok = true;
          valueLines.forEach((line, i) => {
            const parts = line.split(/\s+/).filter(Boolean);
            const a = parseShotsCell(parts[0]);
            const b = parseShotsCell(parts[1]);
            if (!a || !b) {
              ok = false;
              return;
            }
            us[cells[i]] = ourFirst ? a : b;
            opp[cells[i]] = ourFirst ? b : a;
          });
          if (ok) shots = { us: us as TpeShotsBreakdown["us"], opponent: opp as TpeShotsBreakdown["opponent"] };
          else warnings.push("La table « Shots and goals scored » n'a pas pu être lue entièrement.");
        }
        // Juste après ces 7 paires vient : blocked shots, danger zone, puis
        // XG — toujours dans cet ordre, avant l'étiquette "XG".
        const xgLabelIdx = leftLines.findIndex((l, i) => i > shotsTitleIdx && l === "XG");
        if (xgLabelIdx > 0) {
          const xgLine = leftLines[xgLabelIdx - 1];
          const nums = xgLine.match(/-?\d+\.\d+/g);
          if (nums && nums.length === 2) {
            teamXgUs = ourFirst ? Number(nums[0]) : Number(nums[1]);
            teamXgOpponent = ourFirst ? Number(nums[1]) : Number(nums[0]);
          }
        }
      }

      const faceoffTitleIdx = leftLines.findIndex((l) => l === "Face-Offs");
      if (faceoffTitleIdx >= 0) {
        const headerLine = leftLines[faceoffTitleIdx + 1];
        const abbrs = headerLine?.split(" ").filter(Boolean) ?? [];
        const ourFirst = abbrs.length === 2 ? normalize(abbrs[0]).startsWith("QA") : true;
        const valueLines: string[] = [];
        for (let i = faceoffTitleIdx + 2; i < leftLines.length && valueLines.length < 10; i += 2) {
          valueLines.push(leftLines[i]);
        }
        const cells = ["total", "p1", "p2", "p3", "pp", "pk", "even", "dz", "nz", "oz"] as const;
        if (valueLines.length === 10) {
          const fo: Partial<TpeFaceoffBreakdown> = {};
          let ok = true;
          valueLines.forEach((line, i) => {
            const parsed = parseFaceoffLine(line, ourFirst);
            if (!parsed) {
              ok = false;
              return;
            }
            fo[cells[i]] = parsed;
          });
          if (ok) faceoffs = fo as TpeFaceoffBreakdown;
          else warnings.push("La table « Face-Offs » n'a pas pu être lue entièrement.");
        }
      }

      // ---- Diagramme « Face-Offs by zones » : les 9 ronds de la patinoire,
      // au centre de la page (pas dans la colonne de gauche cette fois). ----
      const zoneTitle = items.find((it) => it.str === "Face-Offs by zones");
      if (zoneTitle) {
        faceoffZones = parseFaceoffZoneDiagram(items, zoneTitle.y, pageWidth);
        if (!faceoffZones) {
          warnings.push("Le diagramme « Face-Offs by zones » n'a pas pu être lu — les 9 ronds de la patinoire ne sont pas disponibles pour ce match.");
        }
      }
    }
  }

  if (players.length === 0) {
    warnings.push("Aucune ligne de joueur des As de Québec trouvée dans ce rapport — vérifie qu'il s'agit bien du bon fichier.");
  }
  if (!shots) warnings.push("Tableau « Shots and goals scored » introuvable ou illisible.");
  if (!faceoffs) warnings.push("Tableau « Face-Offs » introuvable ou illisible.");

  return { ourTeamName, opponentName, players, shots, faceoffs, faceoffZones, teamXgUs, teamXgOpponent, warnings };
}
