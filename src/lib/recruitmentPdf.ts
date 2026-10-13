import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { RecruitmentData } from "./recruitmentData";

// Mêmes couleurs que l'application : fond sombre sur photo, or du club.
const GOLD = rgb(0.992, 0.792, 0.216); // #fdca37
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.74, 0.77, 0.82);
const GREEN = rgb(0.45, 0.85, 0.55);
const RED = rgb(1, 0.5, 0.5);
const DARK = rgb(0.05, 0.047, 0.047); // #0d0c0c

/** Les polices standard du PDF n'ont pas tous les caractères : on remplace ceux qui manquent. */
function safe(s: string): string {
  return s
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array | null | undefined): Promise<PDFImage | null> {
  if (!bytes || bytes.length === 0) return null;
  try {
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

async function fetchBytes(url: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Rectangle à coins arrondis (chemin SVG ; y vers le bas à partir du coin haut-gauche). */
function roundedPath(w: number, h: number, r: number): string {
  return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
}

export interface RecruitmentPdfOptions {
  /** Octets de la photo de fond (JPEG). Sans elle, fond uni foncé. */
  background?: Uint8Array | null;
}

/** Fiche de recrutement d'un joueur, en PDF (A4 portrait) — prête à joindre à un courriel. */
export async function buildRecruitmentPdf(data: RecruitmentData, options: RecruitmentPdfOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const bg = await embedImage(doc, options.background);
  const photo = await embedImage(doc, await fetchBytes(data.player.photo_url));

  const W = 595.28;
  const H = 841.89;
  const M = 36;
  let page!: PDFPage;
  let pageNumber = 0;

  const text = (t: string, x: number, y: number, size: number, font: PDFFont, color = WHITE) =>
    page.drawText(safe(t), { x, y, size, font, color });
  const widthOf = (t: string, size: number, font: PDFFont) => font.widthOfTextAtSize(safe(t), size);
  const textRight = (t: string, xRight: number, y: number, size: number, font: PDFFont, color = WHITE) =>
    text(t, xRight - widthOf(t, size, font), y, size, font, color);
  const textCenter = (t: string, cx: number, y: number, size: number, font: PDFFont, color = WHITE) =>
    text(t, cx - widthOf(t, size, font) / 2, y, size, font, color);

  const card = (x: number, yTop: number, w: number, h: number, r = 10, fillOpacity = 0.09, border = true) => {
    page.drawSvgPath(roundedPath(w, h, r), {
      x,
      y: yTop,
      color: WHITE,
      opacity: fillOpacity,
      borderColor: GOLD,
      borderWidth: border ? 0.6 : 0,
      borderOpacity: border ? 0.45 : 0,
    });
  };

  /** Nouvelle page : photo de fond assombrie, bandeau doré en pied. */
  function newPage() {
    page = doc.addPage([W, H]);
    pageNumber += 1;
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });
    if (bg) {
      // « cover » : on remplit la page, quitte à rogner les côtés de la photo.
      const scale = Math.max(W / bg.width, H / bg.height);
      const w = bg.width * scale;
      const h = bg.height * scale;
      page.drawImage(bg, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
      page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK, opacity: 0.84 });
    }
    page.drawRectangle({ x: 0, y: 0, width: W, height: 5, color: GOLD });
    text("As de Québec M17 AAA", M, 18, 7.5, regular, MUTED);
    textRight(`Page ${pageNumber}`, W - M, 18, 7.5, regular, MUTED);
  }

  function crest(x: number, yTop: number) {
    // Blason monogramme du club (même dessin que l'application).
    page.drawSvgPath("M24 1 L46 9 V27 C46 40 37 50 24 55 C11 50 2 40 2 27 V9 Z", {
      x,
      y: yTop,
      scale: 0.82,
      color: DARK,
      borderColor: GOLD,
      borderWidth: 2,
    });
    textCenter("AS", x + 24 * 0.82, yTop - 31, 17, serif, GOLD);
  }

  newPage();
  let y = H - M;

  // ---- En-tête ----
  crest(M, y);
  text("AS DE QUÉBEC M17 AAA", M + 56, y - 22, 17, bold, WHITE);
  text("FICHE DE RECRUTEMENT", M + 56, y - 38, 9, bold, GOLD);
  y -= 58;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: GOLD, opacity: 0.6 });
  y -= 22;

  // ---- Identité : photo à droite, nom et pastilles à gauche ----
  const photoSize = 104;
  const textRightLimit = photo ? W - M - photoSize - 20 : W - M;
  if (photo) {
    const dims = photo.scaleToFit(photoSize, photoSize);
    const px = W - M - dims.width;
    const pyTop = y;
    page.drawRectangle({ x: px - 2, y: pyTop - dims.height - 2, width: dims.width + 4, height: dims.height + 4, color: GOLD });
    page.drawImage(photo, { x: px, y: pyTop - dims.height, width: dims.width, height: dims.height });
  }

  // Le nom se réduit s'il ne tient pas à côté de la photo.
  let nameSize = 32;
  while (widthOf(data.player.full_name, nameSize, bold) > textRightLimit - M && nameSize > 18) nameSize -= 1;
  text(data.player.full_name, M, y - nameSize + 4, nameSize, bold, WHITE);

  const chips = [
    data.player.jersey_number != null ? `#${data.player.jersey_number}` : null,
    data.positionLabel,
    data.heightLabel,
    data.player.weight_lbs != null ? `${data.player.weight_lbs} lbs` : null,
  ].filter(Boolean) as string[];
  let cx = M;
  const chipY = y - nameSize - 26;
  for (const c of chips) {
    const w = widthOf(c, 10, bold) + 18;
    page.drawSvgPath(roundedPath(w, 20, 10), { x: cx, y: chipY + 20, color: GOLD, opacity: 0.16, borderColor: GOLD, borderWidth: 0.8 });
    text(c, cx + 9, chipY + 6.5, 10, bold, GOLD);
    cx += w + 8;
  }
  y -= Math.max(photo ? photoSize + 4 : 0, nameSize + 48) + 18;

  // ---- Statistiques de la saison ----
  text("STATISTIQUES  -  SAISON (MATCHS OFFICIELS)", M, y, 8.5, bold, GOLD);
  y -= 12;
  const perRow = 4;
  const gap = 10;
  const cardW = (W - 2 * M - gap * (perRow - 1)) / perRow;
  const cardH = 56;
  data.boxes.forEach((b, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = M + col * (cardW + gap);
    const top = y - row * (cardH + gap);
    card(x, top, cardW, cardH, 9, b.highlight ? 0.16 : 0.08);
    textCenter(b.value, x + cardW / 2, top - 30, 21, bold, b.highlight ? GOLD : WHITE);
    textCenter(b.label.toUpperCase(), x + cardW / 2, top - 46, 7, bold, b.highlight ? GOLD : MUTED);
  });
  y -= Math.ceil(data.boxes.length / perRow) * (cardH + gap) + 14;

  // ---- Game log ----
  if (data.log.length > 0) {
    const cols = data.logColumns;
    const cellW = cols.length > 2 ? 40 : 62;
    const left = M + 14;
    const right = W - M - 14;
    const rowH = 17;
    const headerBlock = 40;

    const startCard = (heightAvail: number) => {
      const rowsFit = Math.max(1, Math.floor((heightAvail - headerBlock - 12) / rowH));
      return rowsFit;
    };
    let index = 0;
    let first = true;
    while (index < data.log.length) {
      const avail = y - 34;
      const rowsFit = startCard(avail);
      const chunk = data.log.slice(index, index + rowsFit);
      const cardHeight = headerBlock + chunk.length * rowH + 10;
      card(M, y + (first ? -14 : 0), W - 2 * M, cardHeight, 10, 0.07);
      let ty = y + (first ? -14 : 0);
      text(`GAME LOG  -  ${data.log.length} MATCH${data.log.length > 1 ? "S" : ""}${first ? "" : " (suite)"}`, left, ty - 16, 8.5, bold, GOLD);
      ty -= 33;
      text("DATE", left, ty, 7.5, bold, MUTED);
      text("ADVERSAIRE", left + 62, ty, 7.5, bold, MUTED);
      cols.forEach((c, i) => textRight(c.toUpperCase(), right - (cols.length - 1 - i) * cellW, ty, 7.5, bold, MUTED));
      ty -= 6;
      page.drawLine({ start: { x: left, y: ty }, end: { x: right, y: ty }, thickness: 0.5, color: GOLD, opacity: 0.5 });
      ty -= 12;
      chunk.forEach((row, ri) => {
        if (ri % 2 === 0) {
          page.drawRectangle({ x: left - 6, y: ty - 5, width: right - left + 12, height: rowH, color: WHITE, opacity: 0.045 });
        }
        text(row.date, left, ty, 9, regular, MUTED);
        text(row.opponent, left + 62, ty, 9, bold, WHITE);
        row.cells.forEach((c, ci) => {
          let color = WHITE;
          if (cols[ci] === "+/-") color = c.startsWith("+") ? GREEN : c.startsWith("-") && c.length > 1 ? RED : MUTED;
          if (c === "-") color = MUTED;
          textRight(c, right - (cols.length - 1 - ci) * cellW, ty, 9, regular, color);
        });
        ty -= rowH;
      });
      index += chunk.length;
      first = false;
      if (index < data.log.length) {
        newPage();
        y = H - M;
      }
    }
  }

  return doc.save();
}

/** Récupère la photo de fond de l'application (même origine que la page). */
export async function loadPdfBackground(): Promise<Uint8Array | null> {
  return fetchBytes("/backgrounds/bg-1.jpg");
}

/** Uint8Array → base64, par morceaux (les grosses chaînes plantent String.fromCharCode). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
