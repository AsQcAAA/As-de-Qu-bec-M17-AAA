import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { RecruitmentData } from "./recruitmentData";

const GOLD = rgb(0.72, 0.53, 0.04);
const INK = rgb(0.07, 0.07, 0.07);
const GREY = rgb(0.4, 0.45, 0.52);
const LINE = rgb(0.85, 0.87, 0.9);

/** Les polices standard du PDF n'ont pas tous les caractères : on remplace ceux qui manquent. */
function safe(s: string): string {
  return s.replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E -ÿ]/g, "");
}

async function embedPhoto(doc: PDFDocument, url: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** Fiche de recrutement d'un joueur, en PDF (A4 portrait) — prête à joindre à un courriel. */
export async function buildRecruitmentPdf(data: RecruitmentData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const photo = await embedPhoto(doc, data.player.photo_url);

  const W = 595.28;
  const H = 841.89;
  const M = 40;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const text = (t: string, x: number, yy: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(safe(t), { x, y: yy, size, font, color });
  const textRight = (t: string, xRight: number, yy: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(safe(t), { x: xRight - font.widthOfTextAtSize(safe(t), size), y: yy, size, font, color });

  // ---- En-tête ----
  text("As de Québec M17 AAA", M, y - 14, 18, bold);
  text("Fiche de recrutement", M, y - 32, 11, regular, GREY);
  if (photo) {
    const size = 64;
    const dims = photo.scaleToFit(size, size);
    page.drawImage(photo, { x: W - M - size + (size - dims.width) / 2, y: y - size + (size - dims.height) / 2 + 6, width: dims.width, height: dims.height });
  }
  y -= 78;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  y -= 32;

  // ---- Identité ----
  text(data.player.full_name, M, y, 26, bold);
  y -= 20;
  const idParts = [
    data.player.jersey_number != null ? `#${data.player.jersey_number}` : null,
    data.positionLabel,
    data.heightLabel,
    data.player.weight_lbs != null ? `${data.player.weight_lbs} lbs` : null,
  ].filter(Boolean) as string[];
  text(idParts.join("   |   "), M, y, 11, regular, GREY);
  y -= 30;

  // ---- Statistiques de la saison ----
  text("STATISTIQUES - SAISON (MATCHS OFFICIELS)", M, y, 9, bold, GREY);
  y -= 22;
  const perRow = 4;
  const colW = (W - 2 * M) / perRow;
  for (let i = 0; i < data.boxes.length; i++) {
    const col = i % perRow;
    const rowIdx = Math.floor(i / perRow);
    const cx = M + col * colW + colW / 2;
    const cy = y - rowIdx * 44;
    const b = data.boxes[i];
    const v = safe(b.value);
    page.drawText(v, { x: cx - bold.widthOfTextAtSize(v, 20) / 2, y: cy, size: 20, font: bold, color: b.highlight ? GOLD : INK });
    const l = safe(b.label.toUpperCase());
    page.drawText(l, { x: cx - regular.widthOfTextAtSize(l, 8) / 2, y: cy - 13, size: 8, font: bold, color: GREY });
  }
  y -= Math.ceil(data.boxes.length / perRow) * 44 + 14;

  // ---- Game log ----
  if (data.log.length > 0) {
    text(`GAME LOG (${data.log.length} MATCH${data.log.length > 1 ? "S" : ""})`, M, y, 9, bold, GREY);
    y -= 16;
    const cols = data.logColumns;
    const cellW = cols.length > 2 ? 40 : 60;
    const tableRight = W - M;
    const drawHeader = () => {
      text("Date", M, y, 8, bold, GREY);
      text("Adversaire", M + 62, y, 8, bold, GREY);
      cols.forEach((c, i) => textRight(c, tableRight - (cols.length - 1 - i) * cellW, y, 8, bold, GREY));
      y -= 5;
      page.drawLine({ start: { x: M, y }, end: { x: tableRight, y }, thickness: 0.6, color: LINE });
      y -= 13;
    };
    drawHeader();
    for (const row of data.log) {
      if (y < M + 20) {
        page = doc.addPage([W, H]);
        y = H - M;
        drawHeader();
      }
      text(row.date, M, y, 9, regular);
      text(row.opponent, M + 62, y, 9, regular);
      row.cells.forEach((c, i) => textRight(c, tableRight - (cols.length - 1 - i) * cellW, y, 9, regular));
      y -= 15;
    }
  }

  return doc.save();
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
