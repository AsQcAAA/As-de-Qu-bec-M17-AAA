import { eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb } from "pdf-lib";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { KIND_HEX, cellKind, holidayLabel, isFreeWeekend, labelEvent, primaryEvent } from "@/lib/calendarExport";
import type { CalendarEmailInput } from "@/lib/calendarExport";
import type { ScheduleEvent } from "@/lib/types";

const PAGE_W = 792; // lettre paysage : 11 x 8,5 po
const PAGE_H = 612;
const MARGIN = 24;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
// Les polices standard du PDF ne couvrent pas les émojis : on garde le latin et la ponctuation courante.
const clean = (s: string) => s.replace(/[^ -ÿ–—‘’“”…]/g, "").trim();

type Item = { type: "text"; text: string; bold?: boolean; italic?: boolean; size: number; color: string } | { type: "logo"; logo: string };
type Placed =
  | { kind: "text"; lines: string[]; font: PDFFont; size: number; color: string }
  | { kind: "logo"; img: PDFImage; size: number };

/** Le calendrier (mois ou période) en PDF lettre paysage : mêmes règles que le calendrier du courriel. */
export async function buildCalendarPdf({ month, events, games, dayNotes, highlights, rangeStart, rangeEnd }: CalendarEmailInput): Promise<Uint8Array> {
  const custom = !!rangeStart && !!rangeEnd && rangeStart <= rangeEnd;
  const first = custom ? new Date(`${rangeStart}T12:00:00`) : startOfMonth(month);
  const last = custom ? new Date(`${rangeEnd}T12:00:00`) : endOfMonth(month);
  const title = custom
    ? `${format(first, "d MMM yyyy", { locale: fr })} au ${format(last, "d MMM yyyy", { locale: fr })}`
    : format(month, "MMMM yyyy", { locale: fr }).replace(/^./, (c) => c.toUpperCase());

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const logoCache = new Map<string, PDFImage | null>();
  async function logoImage(path: string) {
    if (logoCache.has(path)) return logoCache.get(path) ?? null;
    let img: PDFImage | null = null;
    try {
      const res = await fetch(path);
      if (res.ok) img = await pdf.embedPng(new Uint8Array(await res.arrayBuffer()));
    } catch {
      img = null;
    }
    logoCache.set(path, img);
    return img;
  }

  const eventsByDay = new Map<string, ScheduleEvent[]>();
  for (const e of events) eventsByDay.set(e.event_date, [...(eventsByDay.get(e.event_date) ?? []), e]);
  const gameByDate = new Map(games.map((g) => [g.game_date, g]));
  const days = eachDayOfInterval({ start: startOfWeek(first, { weekStartsOn: 1 }), end: endOfWeek(last, { weekStartsOn: 1 }) });
  const rows = days.length / 7;

  // Bandeau titre + en-tête des jours
  const titleH = 34;
  const headH = 16;
  page.drawRectangle({ x: MARGIN, y: PAGE_H - MARGIN - titleH, width: PAGE_W - 2 * MARGIN, height: titleH, color: hex("#0d0c0c") });
  page.drawText(clean(`As de Québec M17 AAA — ${title}`), { x: MARGIN + 12, y: PAGE_H - MARGIN - 22, size: 16, font: bold, color: hex("#fdca37") });
  const colW = (PAGE_W - 2 * MARGIN) / 7;
  const headTop = PAGE_H - MARGIN - titleH;
  ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].forEach((d, i) => {
    page.drawRectangle({ x: MARGIN + i * colW, y: headTop - headH, width: colW, height: headH, color: hex("#0d0c0c"), borderColor: hex("#0d0c0c"), borderWidth: 0.5 });
    const w = bold.widthOfTextAtSize(d, 9);
    page.drawText(d, { x: MARGIN + i * colW + (colW - w) / 2, y: headTop - headH + 4.5, size: 9, font: bold, color: hex("#fdca37") });
  });

  const gridTop = headTop - headH;
  const rowH = (gridTop - MARGIN) / rows;

  function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= maxW || !line) line = next;
        else {
          out.push(line);
          line = word;
        }
      }
      if (line) out.push(line);
    }
    return out;
  }

  for (let idx = 0; idx < days.length; idx++) {
    const day = days[idx];
    const key = format(day, "yyyy-MM-dd");
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const x = MARGIN + col * colW;
    const yTop = gridTop - row * rowH;

    const dayEvents = eventsByDay.get(key) ?? [];
    const inMonth = custom ? key >= rangeStart! && key <= rangeEnd! : isSameMonth(day, month);
    const game = gameByDate.get(key);
    const primary = game ? (dayEvents.find((e) => e.event_type === "game") ?? ({ event_type: "game" } as ScheduleEvent)) : primaryEvent(dayEvents);
    const freeWeekend = inMonth && isFreeWeekend(day, dayEvents, game);
    const label = labelEvent(dayEvents);
    const holiday = label ? holidayLabel(label.title) : null;
    const highlighted = inMonth && (highlights[key] ?? false);
    const isWeekday = getDay(day) >= 1 && getDay(day) <= 5;
    const showEncadrement = inMonth && isWeekday && !holiday && !freeWeekend && !highlighted;
    const kind = cellKind(primary, label, game, freeWeekend, highlighted);

    page.drawRectangle({
      x,
      y: yTop - rowH,
      width: colW,
      height: rowH,
      color: hex(inMonth ? KIND_HEX[kind] : "#f8fafc"),
      borderColor: hex("#cbd5e1"),
      borderWidth: 0.5,
    });
    page.drawText(format(day, "d"), { x: x + 4, y: yTop - 12, size: 10, font: bold, color: hex(inMonth ? "#1a1a1a" : "#cbd5e1") });
    if (!inMonth) continue;

    const items: Item[] = [];
    if (showEncadrement) items.push({ type: "text", text: "Encadrement Sport-Études", italic: true, size: 6.5, color: "#475569" });
    if (primary?.event_type === "game" && game) {
      const team = findTeamByOpponent(game.opponent);
      if (team?.logo.endsWith(".png")) items.push({ type: "logo", logo: team.logo });
      items.push({ type: "text", text: game.is_home ? "Domicile" : "Visiteur", bold: true, size: 8.5, color: "#1a1a1a" });
      items.push({ type: "text", text: team?.name ?? game.opponent, bold: true, size: 8, color: "#1a1a1a" });
      if (primary.start_time) items.push({ type: "text", text: primary.start_time.slice(0, 5), bold: true, size: 8, color: "#1a1a1a" });
      if (game.location) items.push({ type: "text", text: game.location, size: 6.5, color: "#1a1a1a" });
      if (!game.is_home && game.bus_departure_time) {
        items.push({ type: "text", text: `Départ de Québec ${game.bus_departure_time.slice(0, 5)}`, bold: true, size: 6.5, color: "#1a1a1a" });
      }
    }
    if (freeWeekend) items.push({ type: "text", text: "Congé", bold: true, size: 8.5, color: "#1a1a1a" });
    else if (label) items.push({ type: "text", text: holiday ?? label.title, bold: true, size: 8.5, color: "#1a1a1a" });
    const note = dayNotes[key]?.trim();
    if (note) items.push({ type: "text", text: note, bold: true, size: 7, color: "#1a1a1a" });

    // On réduit l'échelle jusqu'à ce que tout entre dans la case.
    const maxW = colW - 8;
    const room = rowH - 16;
    let plan: Placed[] = [];
    for (let scale = 1; scale >= 0.55; scale -= 0.05) {
      plan = [];
      let h = 0;
      for (const it of items) {
        if (it.type === "logo") {
          const img = await logoImage(it.logo);
          if (!img) continue;
          const size = Math.min(30, rowH * 0.34) * scale;
          plan.push({ kind: "logo", img, size });
          h += size + 2;
        } else {
          const size = it.size * scale;
          const font = it.bold ? bold : it.italic ? italic : regular;
          const lines = wrap(clean(it.text), font, size, maxW);
          plan.push({ kind: "text", lines, font, size, color: it.color });
          h += lines.length * size * 1.18;
        }
      }
      if (h <= room) break;
    }

    let cy = yTop - 16;
    for (const p of plan) {
      if (p.kind === "logo") {
        page.drawImage(p.img, { x: x + (colW - p.size) / 2, y: cy - p.size, width: p.size, height: p.size });
        cy -= p.size + 2;
      } else {
        for (const line of p.lines) {
          const w = p.font.widthOfTextAtSize(line, p.size);
          cy -= p.size * 1.18;
          page.drawText(line, { x: x + (colW - w) / 2, y: cy + p.size * 0.2, size: p.size, font: p.font, color: hex(p.color) });
        }
      }
    }
  }

  return pdf.save();
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
