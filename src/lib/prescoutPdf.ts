import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { LineupPlayer, OnePagerData } from "./prescoutOnePager";

// Une page lettre, sur fond blanc (pensée pour l'impression), aux couleurs du club.
const GOLD = rgb(0.992, 0.792, 0.216);
const INK = rgb(0.05, 0.047, 0.047);
const TEXT = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.86, 0.87, 0.9);
const SOFT = rgb(0.96, 0.96, 0.97);
const RED = rgb(0.75, 0.15, 0.15);

const W = 612;
const H = 792;
const M = 28;

/** Les polices standard du PDF n'ont pas tous les caractères : on remplace ceux qui manquent. */
function safe(s: string): string {
  return s
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, "·")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

function fit(font: PDFFont, s: string, size: number, max: number): string {
  let t = safe(s);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > max) t = t.slice(0, -1);
  return t.replace(/\s+$/, "") + "…";
}

function wrap(font: PDFFont, s: string, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of safe(s).split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > max && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export async function buildPrescoutPdf(d: OnePagerData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(d.title));
  doc.setAuthor("As de Québec M17 AAA");
  const page = doc.addPage([W, H]);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const text = (p: PDFPage, s: string, x: number, y: number, size: number, f = reg, color = TEXT) =>
    p.drawText(safe(s), { x, y, size, font: f, color });
  const section = (s: string, x: number, y: number, w: number) => {
    text(page, s.toUpperCase(), x, y, 8.5, bold, INK);
    page.drawRectangle({ x, y: y - 4, width: w, height: 1.2, color: GOLD });
    return y - 15;
  };

  // ---- En-tête ----
  page.drawRectangle({ x: 0, y: H - 74, width: W, height: 74, color: INK });
  page.drawRectangle({ x: 0, y: H - 77, width: W, height: 3, color: GOLD });
  text(page, "PRE-SCOUT", M, H - 30, 10, bold, GOLD);
  text(page, fit(bold, d.team.name.toUpperCase(), 22, W - 2 * M - 150), M, H - 54, 22, bold, rgb(1, 1, 1));
  const right = (s: string, y: number, size: number, f = reg, color = rgb(0.85, 0.86, 0.9)) => {
    const t = safe(s);
    text(page, t, W - M - f.widthOfTextAtSize(t, size), y, size, f, color);
  };
  right(d.when, H - 30, 9.5, bold, rgb(1, 1, 1));
  right(d.where, H - 44, 8.5);
  right("As de Québec M17 AAA", H - 58, 8.5, bold, GOLD);

  let y = H - 98;

  // ---- Fiche de l'équipe ----
  const s = d.stats;
  if (s) {
    const tiles: [string, string, string][] = [
      ["Rang", `${s.rank}e`, `${s.pts} pts`],
      ["Fiche", `${s.w}-${s.lReg}-${s.lOt + s.lSo}`, `${s.gp} PJ · ${s.ptsPct}`],
      ["BP / match", s.gfPerGame, `${s.gf} buts`],
      ["BC / match", s.gaPerGame, `${s.ga} buts`],
      ["AN", `${s.ppPct} %`, s.pp],
      ["DN", `${s.pkPct} %`, s.pk],
      ["Pén. / match", s.pimPerGame, `${s.pim} min`],
      ["5 derniers", d.last5 ?? "—", "récent à droite"],
    ];
    const tw = (W - 2 * M - 7 * 5) / 8;
    tiles.forEach(([label, value, sub], i) => {
      const x = M + i * (tw + 5);
      page.drawRectangle({ x, y: y - 40, width: tw, height: 44, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
      text(page, label.toUpperCase(), x + 5, y - 6, 6, bold, MUTED);
      text(page, fit(bold, value, label === "5 derniers" ? 9 : 13, tw - 8), x + 5, y - 22, label === "5 derniers" ? 9 : 13, bold, INK);
      text(page, fit(reg, sub, 6.5, tw - 8), x + 5, y - 33, 6.5, reg, MUTED);
    });
    y -= 52;
    const u = d.usStats;
    if (u) {
      text(
        page,
        `Pour comparer, les As : ${u.rank}e · AN ${u.ppPct} % · DN ${u.pkPct} % · ${u.gfPerGame} BP/match · ${u.gaPerGame} BC/match. Stats de la ligue au ${d.statsUpdated}.`,
        M,
        y,
        7,
        reg,
        MUTED
      );
      y -= 14;
    }
  }

  // ---- Deux colonnes ----
  const leftW = 330;
  const rightX = M + leftW + 16;
  const rightW = W - M - rightX;
  let ly = y;
  let ry = y;

  // Alignement (colonne de gauche)
  const lineupTitle =
    d.lineupSource === "attendu"
      ? "Alignement attendu"
      : d.lineupSource === "dernier match"
        ? `Alignement du dernier match (${d.lineupDate})`
        : "Alignement";
  ly = section(lineupTitle, M, ly, leftW);
  const card = (p: LineupPlayer | undefined, x: number, yy: number, w: number) => {
    page.drawRectangle({ x, y: yy - 28, width: w, height: 31, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6 });
    if (!p) return;
    text(page, p.pos, x + 4, yy - 7, 5.5, bold, MUTED);
    text(page, p.n, x + 4, yy - 19, 11, bold, INK);
    text(page, fit(bold, p.name, 7.5, w - 26), x + 23, yy - 8, 7.5, bold, TEXT);
    const bits = [p.season ? p.season : null, p.toiVsUs ? `TG ${p.toiVsUs}` : null].filter(Boolean).join(" · ");
    if (bits) text(page, fit(reg, bits, 6, w - 26), x + 23, yy - 17, 6, reg, MUTED);
    if (p.ptsVsUs > 0) text(page, fit(bold, `${p.ptsVsUs} pt${p.ptsVsUs > 1 ? "s" : ""} contre nous`, 6, w - 26), x + 23, yy - 25, 6, bold, RED);
  };
  if (d.forwards.length + d.defense.length + d.goalies.length === 0) {
    text(page, "Aucun alignement saisi (ni attendu, ni lors d'un match contre eux).", M, ly, 8, reg, MUTED);
    ly -= 16;
  } else {
    const cw3 = (leftW - 2 * 4) / 3;
    for (const row of d.forwards) {
      ["AG", "C", "AD"].forEach((pos, i) => card(row.find((p) => p.pos === pos), M + i * (cw3 + 4), ly, cw3));
      ly -= 35;
    }
    ly -= 3;
    const cw2 = (leftW - 4) / 2;
    for (const row of d.defense) {
      row.forEach((p, i) => card(p, M + i * (cw2 + 4), ly, cw2));
      ly -= 35;
    }
    if (d.goalies.length) {
      ly -= 3;
      d.goalies.forEach((p, i) => card(p, M + i * (cw2 + 4), ly, cw2));
      ly -= 35;
    }
    text(page, "Saison : PJ · buts-passes = points (ligue). TG : temps de glace moyen dans nos matchs contre eux.", M, ly - 2, 6, reg, MUTED);
    ly -= 16;
  }

  // Colonne de droite : pointeurs, gardiens, historique, pointeurs contre nous.
  const table = (title: string, head: string[], rows: string[][], widths: number[]) => {
    ry = section(title, rightX, ry, rightW);
    let x = rightX;
    head.forEach((h, i) => {
      text(page, h, x, ry, 6.5, bold, MUTED);
      x += widths[i];
    });
    ry -= 10;
    if (rows.length === 0) {
      text(page, "Aucune donnée.", rightX, ry, 7.5, reg, MUTED);
      ry -= 10;
    }
    rows.forEach((r, ri) => {
      if (ri % 2 === 0) page.drawRectangle({ x: rightX - 2, y: ry - 2.5, width: rightW + 2, height: 10, color: SOFT });
      let cx = rightX;
      r.forEach((c, i) => {
        text(page, fit(i === 0 ? bold : reg, c, 7.5, widths[i] - 3), cx, ry, 7.5, i === 0 ? bold : reg, TEXT);
        cx += widths[i];
      });
      ry -= 10;
    });
    ry -= 8;
  };
  const nameW = rightW - 4 * 22;
  table(
    "Meilleurs pointeurs",
    ["Joueur", "PJ", "B", "A", "PTS"],
    d.scorers.map((p) => [p.name, String(p.gp), String(p.g), String(p.a), String(p.g + p.a)]),
    [nameW, 22, 22, 22, 22]
  );
  table(
    "Gardiens",
    ["Gardien", "PJ", "Fiche", "MOY"],
    d.leagueGoalies.map((g) => [g.name, String(g.gp), g.w != null ? `${g.w}-${g.l}-${g.otl}` : "—", g.gaa != null ? g.gaa.toFixed(2) : "—"]),
    [rightW - 22 - 44 - 30, 22, 44, 30]
  );
  table(
    "Contre nous cette saison",
    ["Date", "Résultat"],
    d.history.map((h) => [h.date, h.label]),
    [50, rightW - 50]
  );
  table(
    "Leurs pointeurs contre nous",
    ["Joueur", "B", "A", "PTS"],
    d.theirScorersVsUs.map((p) => [`${p.n != null ? `#${p.n} ` : ""}${p.name}`, String(p.g), String(p.a), String(p.g + p.a)]),
    [rightW - 66, 22, 22, 22]
  );

  // ---- Notes (pleine largeur, sous la plus longue des deux colonnes) ----
  let ny = Math.min(ly, ry) - 2;
  if (d.notes.length && ny > M + 30) {
    ny = section("Notes de pre-scout", M, ny, W - 2 * M);
    for (const n of d.notes) {
      const lines = wrap(reg, n.text, 7.5, W - 2 * M - 48);
      if (ny - lines.length * 9.5 < M) break;
      text(page, n.label, M, ny, 7.5, bold, INK);
      lines.forEach((l, i) => text(page, l, M + 48, ny - i * 9.5, 7.5));
      ny -= lines.length * 9.5 + 4;
    }
  }

  text(page, `Généré par l'app As de Québec M17 AAA · ${safe(d.title)}`, M, 14, 6, reg, MUTED);
  return doc.save();
}
