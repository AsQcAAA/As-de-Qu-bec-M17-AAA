import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { LineupPlayer, MapKind, OnePagerData } from "./prescoutOnePager";
import type { FormationArrow, FormationValue } from "@/components/FormationMap";

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

// ---- Dispositions PP / PK : même glace que FormationStatic (2 unités = 1 pied) ----
const ICE = rgb(0.973, 0.98, 0.988);
const BOARD = rgb(0.2, 0.255, 0.333);
const RINK_RED = rgb(0.863, 0.149, 0.149);
const RINK_BLUE = rgb(0.145, 0.388, 0.922);
const CREASE = rgb(0.75, 0.86, 1);
const isFullKind = (k: MapKind) => k === "bo" || k === "pkbo";
const isRoleKind = (k: MapKind) => k === "pk" || k === "pkbo" || k === "pkfo";
const isFlipKind = (k: MapKind) => k === "pk" || k === "pkfo";
const circlePath = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

type Stroke = { d: string; fill?: ReturnType<typeof rgb>; stroke?: ReturnType<typeof rgb>; w?: number; dash?: number[] };

/** Demi-glace (zone offensive, but en haut) ; retournée pour le PK adverse (but en bas). */
function halfRink(flip: boolean): Stroke[] {
  const H = 178;
  const fy = (y: number) => (flip ? H - y : y);
  const sw = (v: 0 | 1) => (flip ? 1 - v : v);
  const out: Stroke[] = [
    { d: `M 56 ${fy(0)} H 114 A 56 56 0 0 ${sw(1)} 170 ${fy(56)} V ${fy(178)} H 0 V ${fy(56)} A 56 56 0 0 ${sw(1)} 56 ${fy(0)} Z`, fill: ICE, stroke: BOARD, w: 2.5 },
    { d: `M 2 ${fy(22)} L 168 ${fy(22)}`, stroke: RINK_RED, w: 1.2 },
    { d: `M 0 ${fy(150)} L 170 ${fy(150)}`, stroke: RINK_BLUE, w: 5 },
    { d: `M 73 ${fy(22)} V ${fy(12)} H 97 V ${fy(22)}`, stroke: RINK_RED, w: 1.2 },
    { d: `M 67 ${fy(22)} A 18 18 0 0 ${sw(0)} 103 ${fy(22)} Z`, fill: CREASE, stroke: RINK_RED, w: 1.2 },
  ];
  for (const cx of [41, 129]) {
    out.push({ d: circlePath(cx, fy(62), 30), stroke: RINK_RED, w: 1.2 });
    out.push({ d: circlePath(cx, fy(62), 2.6), fill: RINK_RED });
    out.push({ d: circlePath(cx, fy(166), 2.6), fill: RINK_RED });
  }
  return out;
}

/** Glace complète à la verticale (sortie de zone : l'équipe étudiée part du bas). */
function fullRink(): Stroke[] {
  const out: Stroke[] = [
    { d: "M 56 0 H 114 A 56 56 0 0 1 170 56 V 344 A 56 56 0 0 1 114 400 H 56 A 56 56 0 0 1 0 344 V 56 A 56 56 0 0 1 56 0 Z", fill: ICE, stroke: BOARD, w: 2.5 },
    { d: "M 0 150 L 170 150", stroke: RINK_BLUE, w: 5 },
    { d: "M 0 250 L 170 250", stroke: RINK_BLUE, w: 5 },
    { d: "M 0 200 L 170 200", stroke: RINK_RED, w: 3, dash: [6, 3] },
    { d: circlePath(85, 200, 30), stroke: RINK_BLUE, w: 1.2 },
    { d: circlePath(85, 200, 2.6), fill: RINK_BLUE },
    { d: "M 4 378 L 166 378", stroke: RINK_RED, w: 1.2 },
    { d: "M 4 22 L 166 22", stroke: RINK_RED, w: 1.2 },
    { d: "M 73 378 V 388 H 97 V 378", stroke: RINK_RED, w: 1.2 },
    { d: "M 73 22 V 12 H 97 V 22", stroke: RINK_RED, w: 1.2 },
    { d: "M 67 378 A 18 18 0 0 1 103 378 Z", fill: CREASE, stroke: RINK_RED, w: 1.2 },
    { d: "M 67 22 A 18 18 0 0 0 103 22 Z", fill: CREASE, stroke: RINK_RED, w: 1.2 },
  ];
  for (const cx of [41, 129]) {
    for (const cy of [338, 62]) {
      out.push({ d: circlePath(cx, cy, 30), stroke: RINK_RED, w: 1.2 });
      out.push({ d: circlePath(cx, cy, 2.6), fill: RINK_RED });
    }
    for (const cy of [240, 160]) out.push({ d: circlePath(cx, cy, 2.6), fill: RINK_RED });
  }
  return out;
}

function arrowD(a: FormationArrow): string {
  const p = a.pts;
  if (p && p.length > 2) {
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length - 1; i++) d += ` Q ${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`;
    return `${d} L ${p[p.length - 1][0]} ${p[p.length - 1][1]}`;
  }
  return a.cx != null && a.cy != null ? `M ${a.x1} ${a.y1} Q ${a.cx} ${a.cy} ${a.x2} ${a.y2}` : `M ${a.x1} ${a.y1} L ${a.x2} ${a.y2}`;
}

/** Point d'où arrive le trait, pour orienter la pointe de la flèche. */
function arrowFrom(a: FormationArrow): [number, number] {
  if (a.pts && a.pts.length > 2) return a.pts[a.pts.length - 2];
  if (a.cx != null && a.cy != null) return [a.cx, a.cy];
  return [a.x1, a.y1];
}

/** Dessine une disposition ; (x, yTop) = coin supérieur gauche, largeur en points. Renvoie la hauteur. */
function drawFormation(page: PDFPage, bold: PDFFont, kind: MapKind, v: FormationValue, names: Record<string, string>, x: number, yTop: number, width: number): number {
  const full = isFullKind(kind);
  const sc = width / 170;
  const h = (full ? 400 : 178) * sc;
  for (const st of full ? fullRink() : halfRink(isFlipKind(kind))) {
    page.drawSvgPath(st.d, {
      x,
      y: yTop,
      scale: sc,
      color: st.fill,
      borderColor: st.stroke,
      borderWidth: st.stroke ? (st.w ?? 1) : undefined,
      borderDashArray: st.dash,
    });
  }
  const px = (mx: number) => x + mx * sc;
  const py = (my: number) => yTop - my * sc;
  for (const a of v.arrows ?? []) {
    page.drawSvgPath(arrowD(a), { x, y: yTop, scale: sc, borderColor: INK, borderWidth: 2, borderDashArray: a.dashed ? [5, 3] : undefined });
    // Pointe de flèche
    const [fx, fy] = arrowFrom(a);
    const ang = Math.atan2(a.y2 - fy, a.x2 - fx);
    const L = 7;
    const p1: [number, number] = [a.x2 - L * Math.cos(ang - 0.45), a.y2 - L * Math.sin(ang - 0.45)];
    const p2: [number, number] = [a.x2 - L * Math.cos(ang + 0.45), a.y2 - L * Math.sin(ang + 0.45)];
    page.drawSvgPath(`M ${a.x2} ${a.y2} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} Z`, { x, y: yTop, scale: sc, color: INK });
  }
  v.markers.forEach((m, i) => {
    page.drawCircle({ x: px(m.x), y: py(m.y), size: 7 * sc, color: m.number ? GOLD : rgb(0.886, 0.91, 0.94), borderColor: INK, borderWidth: 1.3 * sc });
    const label = m.number || (isRoleKind(kind) ? (m.role ?? (i < 2 ? "F" : "D")) : "X");
    const size = (label.length > 2 ? 5.8 : 7.5) * sc;
    const tw = bold.widthOfTextAtSize(label, size);
    page.drawText(label, { x: px(m.x) - tw / 2, y: py(m.y) - size * 0.36, size, font: bold, color: INK });
    const nm = m.number ? names[m.number] : undefined;
    if (nm) {
      const ns = Math.max(4.6, 6.5 * sc);
      const t = safe(nm);
      const nw = bold.widthOfTextAtSize(t, ns);
      page.drawText(t, { x: px(m.x) - nw / 2, y: py(m.y) - 14.5 * sc - ns * 0.3, size: ns, font: bold, color: INK });
    }
  });
  return h;
}

/** Charge un logo (chemin public, ex. « /logos/teams/piche.png ») ; null si introuvable. */
export type LogoLoader = (path: string) => Promise<Uint8Array | null>;

export async function buildPrescoutPdf(d: OnePagerData, loadLogo?: LogoLoader): Promise<Uint8Array> {
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
      ["5 derniers", d.last5 ?? "—", "récent à gauche"],
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
    const bits = [p.season ? p.season : null, p.toiVsUs ? `TOI ${p.toiVsUs}` : null].filter(Boolean).join(" · ");
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
    text(page, "Saison : PJ · buts-passes = points (ligue). TOI : temps de glace moyen dans nos matchs contre eux.", M, ly - 2, 6, reg, MUTED);
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
    d.scorers.map((p) => [`${p.n ? `#${p.n} ` : ""}${p.name}`, String(p.gp), String(p.g), String(p.a), String(p.g + p.a)]),
    [nameW, 22, 22, 22, 22]
  );
  table(
    "Gardiens",
    ["Gardien", "PJ", "Fiche", "MOY"],
    d.leagueGoalies.map((g) => [`${g.n ? `#${g.n} ` : ""}${g.name}`, String(g.gp), g.w != null ? `${g.w}-${g.l}-${g.otl}` : "—", g.gaa != null ? g.gaa.toFixed(2) : "—"]),
    [rightW - 22 - 44 - 30, 22, 44, 30]
  );
  // Leurs 5 derniers matchs : le logo de l'adversaire plutôt que son nom.
  ry = section("Leurs 5 derniers matchs", rightX, ry, rightW);
  if (d.last5Games.length === 0) {
    text(page, "Aucun match.", rightX, ry, 7.5, reg, MUTED);
    ry -= 18;
  } else {
    const logoCache = new Map<string, Awaited<ReturnType<typeof doc.embedPng>> | null>();
    const embed = async (path: string | null) => {
      if (!path || !loadLogo || !/\.png$/i.test(path)) return null;
      if (!logoCache.has(path)) {
        const bytes = await loadLogo(path).catch(() => null);
        logoCache.set(path, bytes ? await doc.embedPng(bytes).catch(() => null) : null);
      }
      return logoCache.get(path) ?? null;
    };
    const cw = rightW / d.last5Games.length;
    for (let i = 0; i < d.last5Games.length; i++) {
      const g = d.last5Games[i];
      const cx = rightX + i * cw + cw / 2;
      const img = await embed(g.logo);
      const box = 26;
      if (img) {
        const k = Math.min(box / img.width, box / img.height);
        page.drawImage(img, { x: cx - (img.width * k) / 2, y: ry - box + (box - img.height * k) / 2 + 2, width: img.width * k, height: img.height * k });
      } else {
        const t = fit(bold, g.opponent, 6.5, cw - 4);
        text(page, t, cx - bold.widthOfTextAtSize(t, 6.5) / 2, ry - 14, 6.5, bold, TEXT);
      }
      const res = safe(g.result);
      const win = res.startsWith("V");
      text(page, res, cx - bold.widthOfTextAtSize(res, 8.5) / 2, ry - box - 9, 8.5, bold, win ? rgb(0.1, 0.5, 0.2) : RED);
      const sub = safe(`${g.side} · ${g.date}`);
      text(page, sub, cx - reg.widthOfTextAtSize(sub, 6.5) / 2, ry - box - 18, 6.5, reg, MUTED);
    }
    text(page, "Le plus récent à gauche. vs = à domicile, @ = à l'extérieur.", rightX, ry - 54, 6, reg, MUTED);
    ry -= 54 + 14;
  }
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

  // Les dispositions se placent sous l'alignement (colonne de gauche) ; les notes ensuite, pleine largeur.
  let ny = ly - 2;
  let pg = page;
  const mapsRight = M + leftW;

  // TOI moyen contre nous : tous leurs patineurs vus dans nos matchs (rapport TPE).
  if (d.toiVsUs.length) {
    const rows = d.toiVsUs.slice(0, 18);
    ry = section("TOI moyen contre nous", rightX, ry, rightW);
    const colW = (rightW - 10) / 2;
    const half = Math.ceil(rows.length / 2);
    [rows.slice(0, half), rows.slice(half)].forEach((col, ci) => {
      const x0 = rightX + ci * (colW + 10);
      col.forEach((p, i) => {
        const y = ry - i * 10;
        if (i % 2 === 0) page.drawRectangle({ x: x0 - 2, y: y - 2.5, width: colW + 2, height: 10, color: SOFT });
        const lbl = fit(bold, `#${p.n} ${p.name.split(/\s+/).slice(1).join(" ") || p.name}`, 7, colW - 38);
        text(page, lbl, x0, y, 7, bold, TEXT);
        text(page, `${p.gp} MJ`, x0 + colW - 36, y, 5.5, reg, MUTED);
        const t = safe(p.toi);
        text(page, t, x0 + colW - bold.widthOfTextAtSize(t, 7.5), y, 7.5, bold, INK);
      });
    });
    ry -= half * 10 + 4;
    text(page, "Patineurs, du plus utilisé au moins utilisé. MJ = matchs contre nous.", rightX, ry, 6, reg, MUTED);
    ry -= 12;
  }

  // ---- Dispositions PP / PK déjà dessinées ----
  if (d.maps.length) {
    const halfW = 104;
    const fullW = 56;
    const gap = 12;
    const slotH = (k: MapKind) => (isFullKind(k) ? 400 * (fullW / 170) : 178 * (halfW / 170));
    const rowH = Math.max(...d.maps.map((m) => slotH(m.kind))) + 40;
    // Pas la place sous les colonnes : les dispositions passent sur une 2e page.
    if (ny - 18 - rowH < M + 16) {
      pg = doc.addPage([W, H]);
      ny = H - M;
    }
    pg.drawText(safe("DISPOSITIONS PP / PK"), { x: M, y: ny, size: 8.5, font: bold, color: INK });
    pg.drawRectangle({ x: M, y: ny - 4, width: leftW, height: 1.2, color: GOLD });
    ny -= 16;
    let x = M;
    let rowTop = ny;
    let rowMax = 0;
    for (const m of d.maps) {
      const w = isFullKind(m.kind) ? fullW : halfW;
      if (x + w > (pg === page ? mapsRight : W - M)) {
        rowTop -= rowMax + 14;
        x = M;
        rowMax = 0;
        if (rowTop - rowH < M + 16) {
          pg = doc.addPage([W, H]);
          rowTop = H - M;
        }
      }
      pg.drawText(safe(m.label), { x, y: rowTop, size: 7.5, font: bold, color: INK });
      const hgt = drawFormation(pg, bold, m.kind, m.value, d.rosterLastNames, x, rowTop - 5, w);
      let used = hgt + 9;
      const noteW = Math.max(w, 100);
      const lines = m.value.note?.trim() ? wrap(reg, m.value.note.trim(), 6.5, noteW).slice(0, 4) : [];
      lines.forEach((l, i) => pg.drawText(l, { x, y: rowTop - 5 - hgt - 9 - i * 8, size: 6.5, font: reg, color: TEXT }));
      used += lines.length * 8;
      rowMax = Math.max(rowMax, used);
      x += Math.max(w, lines.length ? noteW : w) + gap;
    }
    ny = rowTop - rowMax - 14;
  }
  if (pg === page) ny = Math.min(ny, ry - 2);

  // ---- Notes (pleine largeur) ----
  if (d.notes.length) {
    if (ny < M + 50) {
      pg = doc.addPage([W, H]);
      ny = H - M;
    }
    pg.drawText(safe("NOTES DE PRE-SCOUT"), { x: M, y: ny, size: 8.5, font: bold, color: INK });
    pg.drawRectangle({ x: M, y: ny - 4, width: W - 2 * M, height: 1.2, color: GOLD });
    ny -= 15;
    for (const n of d.notes) {
      const lines = wrap(reg, n.text, 7.5, W - 2 * M - 48);
      if (ny - lines.length * 9.5 < M) break;
      text(pg, n.label, M, ny, 7.5, bold, INK);
      lines.forEach((l, i) => text(pg, l, M + 48, ny - i * 9.5, 7.5));
      ny -= lines.length * 9.5 + 4;
    }
  }

  text(page, `Généré par l'app As de Québec M17 AAA · ${safe(d.title)}`, M, 14, 6, reg, MUTED);
  return doc.save();
}
