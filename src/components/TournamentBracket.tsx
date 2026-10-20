"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { isOurs, teamDisplay, type ResolvedGame, type ResolvedSlot } from "@/lib/tournoi";

/**
 * Tableau du tournoi (matchs 12 à 43), disposé comme dans le PDF de l'organisation :
 * la 2e ronde au centre, deux demi-tableaux qui s'éloignent vers les demi-finales aux
 * extrémités, et la finale au centre, en bas. Trait plein = gagnant, pointillé = perdant.
 */

const BOX_W = 150;
const BOX_H = 62;
const GUTTER = 38;
const PAD = 10;
const COLS = 9;

/** Position de chaque match : colonne (0 à 8, centre = 4) et rang vertical en unités de PDF. */
const POS: Record<number, { col: number; y: number }> = {};
const place = (col: number, items: [number, number][]) => items.forEach(([no, y]) => (POS[no] = { col, y }));
place(4, [[12, 1234], [13, 1134], [14, 1034], [15, 934], [16, 834], [17, 734], [18, 634], [19, 534], [20, 434], [21, 334], [22, 234], [43, 84]]);
place(3, [[23, 1184], [25, 984], [27, 784], [29, 584], [31, 284]]);
place(5, [[24, 1184], [26, 984], [28, 784], [30, 584], [32, 284]]);
place(2, [[33, 1084], [35, 684], [37, 434]]);
place(6, [[34, 1084], [36, 684], [38, 434]]);
place(1, [[39, 564]]);
place(7, [[40, 564]]);
place(0, [[41, 874]]);
place(8, [[42, 874]]);

const Y_TOP = 1260;
const Y_SCALE = 0.98;
const colX = (col: number) => PAD + col * (BOX_W + GUTTER);
const topOf = (no: number) => PAD + (Y_TOP - POS[no].y) * Y_SCALE;
export const BRACKET_W = PAD * 2 + COLS * BOX_W + (COLS - 1) * GUTTER;
export const BRACKET_H = topOf(43) + BOX_H + PAD;

function Row({ r, score, won }: { r: ResolvedSlot; score: number | null; won: boolean }) {
  const t = r.team ? teamDisplay(r.team) : null;
  const ours = isOurs(r);
  return (
    <div className={`flex h-[22px] items-center gap-1.5 px-1.5 ${won ? "font-black" : ""} ${ours ? "bg-gold-100" : ""}`}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {t?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.logo} alt="" className="h-4 w-4 object-contain" />
        ) : null}
      </span>
      <span className={`flex-1 min-w-0 truncate text-[11px] ${t ? "text-slate-900" : "italic text-slate-400"}`}>{t ? t.name : r.pending}</span>
      <span className="w-4 text-right text-[11px] tabular-nums text-slate-900">{score ?? ""}</span>
    </div>
  );
}

export default function TournamentBracket({
  games,
  onEdit,
  contain = false,
}: {
  games: ResolvedGame[];
  onEdit: (no: number) => void;
  /** Plein écran : le tableau entier est agrandi pour remplir l'espace (largeur ET hauteur), sans défilement. */
  contain?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const byWidth = el.clientWidth / BRACKET_W;
      setScale(contain ? Math.min(byWidth, el.clientHeight / BRACKET_H) : Math.min(1, byWidth));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [contain]);

  const bracket = games.filter((g) => g.no >= 12);
  const byNo = new Map(bracket.map((g) => [g.no, g]));

  // Traits : de chaque match source vers le match qu'il alimente.
  const edges: { d: string; kind: "W" | "L"; key: string }[] = [];
  for (const g of bracket) {
    for (const slot of [g.a, g.b]) {
      if (!("from" in slot) || !byNo.has(slot.from)) continue;
      const src = POS[slot.from];
      const dst = POS[g.no];
      const sy = topOf(slot.from) + BOX_H / 2;
      const dy = topOf(g.no) + BOX_H / 2;
      let d: string;
      if (g.no === 43) {
        // Finale : on descend depuis la demi-finale, puis on rejoint la finale par le côté.
        const sx = colX(src.col) + BOX_W / 2;
        const fx = src.col < dst.col ? colX(dst.col) : colX(dst.col) + BOX_W;
        d = `M ${sx} ${sy + BOX_H / 2} V ${dy} H ${fx}`;
      } else if (src.col === dst.col) {
        continue;
      } else if (src.col < dst.col) {
        const x1 = colX(src.col) + BOX_W;
        const x2 = colX(dst.col);
        const mid = x1 + GUTTER / 2;
        d = `M ${x1} ${sy} H ${mid} V ${dy} H ${x2}`;
      } else {
        const x1 = colX(src.col);
        const x2 = colX(dst.col) + BOX_W;
        const mid = x1 - GUTTER / 2;
        d = `M ${x1} ${sy} H ${mid} V ${dy} H ${x2}`;
      }
      edges.push({ d, kind: slot.kind, key: `${slot.from}-${g.no}-${slot.kind}` });
    }
  }

  return (
    <div
      ref={wrapRef}
      className={contain ? "flex h-full w-full items-center justify-center" : "w-full"}
      style={contain ? undefined : { height: BRACKET_H * scale }}
    >
      <div style={contain ? { width: BRACKET_W * scale, height: BRACKET_H * scale, flexShrink: 0 } : undefined}>
      <div className="relative" style={{ width: BRACKET_W, height: BRACKET_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <svg className="absolute inset-0" width={BRACKET_W} height={BRACKET_H}>
          {edges.map((e) => (
            <path key={e.key} d={e.d} fill="none" stroke={e.kind === "W" ? "rgba(253,202,55,0.75)" : "rgba(148,163,184,0.55)"} strokeWidth={e.kind === "W" ? 1.6 : 1.2} strokeDasharray={e.kind === "W" ? undefined : "4 3"} />
          ))}
        </svg>
        {bracket.map((g) => {
          const pos = POS[g.no];
          if (!pos) return null;
          const ours = isOurs(g.ra) || isOurs(g.rb);
          const aWon = g.played && g.scoreA! > g.scoreB!;
          const bWon = g.played && g.scoreB! > g.scoreA!;
          return (
            <button
              key={g.no}
              onClick={() => onEdit(g.no)}
              title="Saisir ou corriger le pointage"
              className={`absolute overflow-hidden rounded-md bg-white text-left shadow ${ours ? "ring-2 ring-gold-400" : ""} ${g.no === 43 ? "ring-2 ring-gold-500" : ""}`}
              style={{ left: colX(pos.col), top: topOf(g.no), width: BOX_W, height: BOX_H }}
            >
              <div className="flex items-center justify-between bg-slate-100 px-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-500" style={{ height: 18 }}>
                <span>#{g.no}{g.no === 43 ? " · Finale" : g.no === 41 || g.no === 42 ? " · Demi" : ""}</span>
                <span>
                  {format(parseISO(g.date), "EEE d", { locale: fr })} {g.time.slice(0, 2)}h{g.time.slice(3, 5)}
                </span>
              </div>
              <Row r={g.ra} score={g.scoreA} won={aWon} />
              <Row r={g.rb} score={g.scoreB} won={bWon} />
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
