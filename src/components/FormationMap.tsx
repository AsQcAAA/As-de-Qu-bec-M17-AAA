"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface FormationMarker {
  id: string;
  number: string;
  x: number;
  y: number;
}

/** Flèche dessinée sur la glace : déplacement (trait plein) ou passe (pointillé). */
export interface FormationArrow {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
  /** Point de contrôle d'une flèche courbe (courbe de Bézier) ; absent = trait droit. */
  cx?: number;
  cy?: number;
  /** Tracé à main levée (points suivis par le doigt/la souris) ; prioritaire sur le point de contrôle. */
  pts?: [number, number][];
}

const arrowPath = (a: { x1: number; y1: number; x2: number; y2: number; cx?: number; cy?: number; pts?: [number, number][] }) => {
  const p = a.pts;
  if (p && p.length > 2) {
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length - 1; i++) {
      d += ` Q ${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`;
    }
    return `${d} L ${p[p.length - 1][0]} ${p[p.length - 1][1]}`;
  }
  return a.cx != null && a.cy != null ? `M ${a.x1} ${a.y1} Q ${a.cx} ${a.cy} ${a.x2} ${a.y2}` : `M ${a.x1} ${a.y1} L ${a.x2} ${a.y2}`;
};
/** Point du milieu de la courbe (là où se place la poignée). */
const arrowMid = (a: FormationArrow) =>
  a.pts && a.pts.length > 2
    ? { x: a.pts[Math.floor(a.pts.length / 2)][0], y: a.pts[Math.floor(a.pts.length / 2)][1] }
    : a.cx != null && a.cy != null
    ? { x: 0.25 * a.x1 + 0.5 * a.cx + 0.25 * a.x2, y: 0.25 * a.y1 + 0.5 * a.cy + 0.25 * a.y2 }
    : { x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2 };

export interface FormationValue {
  markers: FormationMarker[];
  note: string;
  arrows?: FormationArrow[];
}

/** Tête de flèche partagée par les traits (un identifiant par patinoire affichée). */
function ArrowDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#111827" />
      </marker>
    </defs>
  );
}

type Kind = "pp" | "pk" | "bo" | "fo" | "pkbo" | "pkfo";
/** Glace complète à la verticale (sortie de zone) / demi-glace retournée (leur zone défensive, but en bas). */
const isFull = (k: Kind) => k === "bo" || k === "pkbo";
const isFlip = (k: Kind) => k === "pk" || k === "pkfo";
const HALF = { W: 170, H: 178 };
/** Glace complète, à la verticale (même largeur que la demi-glace) : 2 unités = 1 pied (85 pi × 200 pi). */
const FULL = { W: 170, H: 400 };
/** Dessin de la glace complète : fait à l'horizontale puis pivoté, notre zone (celle de l'équipe étudiée) en bas. */
const FULL_DRAW = { W: 400, H: 170 };
const dimsOf = (kind: Kind) => (isFull(kind) ? FULL : HALF);

/** Modèles de départ : positions seulement ; les numéros déjà saisis sont conservés dans l'ordre. */
const PRESETS: Record<Kind, { label: string; positions: [number, number][] }[]> = {
  pp: [
    { label: "Spread", positions: [[31, 128], [24, 49], [140, 134], [85, 78], [143, 51]] },
    { label: "Overload", positions: [[85, 143], [24, 106], [144, 104], [41, 23], [85, 43]] },
    { label: "1-3-1", positions: [[85, 140], [22, 94], [85, 94], [148, 94], [85, 45]] },
    { label: "Umbrella", positions: [[85, 136], [21, 110], [150, 108], [67, 39], [106, 38]] },
  ],
  // Sortie de zone (glace complète) : pas de menu de modèles, 5 joueurs de départ (BO_DEFAULT).
  bo: [],
  // Mise au jeu en zone offensive (cercle gauche), demi-glace.
  fo: [
    { label: "Cercle gauche", positions: [[41, 70], [12, 58], [72, 66], [30, 104], [60, 104]] },
    { label: "Cercle droit", positions: [[129, 70], [98, 66], [158, 58], [110, 104], [140, 104]] },
  ],
  // Leur infériorité : sortie de zone (glace complète, 4 joueurs, sans modèle) et mise au jeu dans leur zone (but en bas).
  pkbo: [],
  pkfo: [
    { label: "Cercle gauche", positions: [[41, 108], [12, 120], [72, 112], [30, 74]] },
    { label: "Cercle droit", positions: [[129, 108], [98, 112], [158, 120], [140, 74]] },
  ],
  pk: [
    { label: "Diamond", positions: [[85, 120], [52, 90], [118, 90], [85, 60]] },
    { label: "Flush", positions: [[55, 128], [113, 127], [85, 94], [86, 55]] },
  ],
};

const uid = () => Math.random().toString(36).slice(2, 9);

/** Sortie de zone : 5 joueurs adverses de départ dans leur zone (en bas), à déplacer. */
const BO_DEFAULT: [number, number][] = [[58, 350], [112, 350], [24, 296], [146, 296], [85, 262]];
const PKBO_DEFAULT: [number, number][] = [[58, 350], [112, 350], [24, 296], [146, 296]];

export const emptyFormation = (kind: Kind): FormationValue => ({
  markers: (kind === "bo" ? BO_DEFAULT : kind === "pkbo" ? PKBO_DEFAULT : PRESETS[kind][0]?.positions ?? []).map(([x, y]) => ({ id: uid(), number: "", x, y })),
  note: "",
});

/** Demi-patinoire (zone offensive de l'équipe, but en haut), proportions réelles : 2 unités = 1 pied. */
function Rink({ flip = false }: { flip?: boolean }) {
  const { W, H } = HALF;
  return (
    <g fill="none" strokeLinecap="round" transform={flip ? `translate(0 ${H}) scale(1 -1)` : undefined}>
      {/* Glace + bandes */}
      <path d={`M 56 0 H ${W - 56} A 56 56 0 0 1 ${W} 56 V ${H} H 0 V 56 A 56 56 0 0 1 56 0 Z`} fill="#f8fafc" stroke="#334155" strokeWidth="2.5" />
      {/* Ligne de but */}
      <line x1="2" y1="22" x2={W - 2} y2="22" stroke="#dc2626" strokeWidth="1.2" />
      {/* Ligne bleue */}
      <line x1="0" y1="150" x2={W} y2="150" stroke="#2563eb" strokeWidth="5" />
      {/* Filet et demi-cercle du gardien */}
      <path d="M 73 22 V 12 H 97 V 22" stroke="#dc2626" strokeWidth="1.2" />
      <path d="M 67 22 A 18 18 0 0 0 103 22 Z" fill="#bfdbfe" fillOpacity="0.7" stroke="#dc2626" strokeWidth="1.2" />
      {/* Cercles de mise au jeu (zone offensive) */}
      {[41, 129].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="62" r="30" stroke="#dc2626" strokeWidth="1.2" />
          <circle cx={cx} cy="62" r="2.6" fill="#dc2626" stroke="none" />
        </g>
      ))}
      {/* Points de mise au jeu de la zone neutre */}
      {[41, 129].map((cx) => (
        <circle key={`n${cx}`} cx={cx} cy="166" r="2.6" fill="#dc2626" stroke="none" />
      ))}
    </g>
  );
}

/** Glace complète à l'horizontale (notre zone à gauche), proportions réelles. */
function FullRink() {
  const { W, H } = FULL_DRAW;
  const ends = [
    { goal: 22, dir: 1 },
    { goal: W - 22, dir: -1 },
  ];
  return (
    <g fill="none" strokeLinecap="round" transform={`translate(0 ${FULL.H}) rotate(-90)`}>
      <path d={`M 56 0 H ${W - 56} A 56 56 0 0 1 ${W} 56 V ${H - 56} A 56 56 0 0 1 ${W - 56} ${H} H 56 A 56 56 0 0 1 0 ${H - 56} V 56 A 56 56 0 0 1 56 0 Z`} fill="#f8fafc" stroke="#334155" strokeWidth="2.5" />
      {/* Lignes bleues et ligne rouge centrale */}
      <line x1="150" y1="0" x2="150" y2={H} stroke="#2563eb" strokeWidth="5" />
      <line x1="250" y1="0" x2="250" y2={H} stroke="#2563eb" strokeWidth="5" />
      <line x1="200" y1="0" x2="200" y2={H} stroke="#dc2626" strokeWidth="3" strokeDasharray="6 3" />
      <circle cx="200" cy={H / 2} r="30" stroke="#2563eb" strokeWidth="1.2" />
      <circle cx="200" cy={H / 2} r="2.6" fill="#2563eb" stroke="none" />
      {ends.map(({ goal, dir }) => (
        <g key={goal}>
          <line x1={goal} y1="4" x2={goal} y2={H - 4} stroke="#dc2626" strokeWidth="1.2" />
          {/* Filet et demi-cercle du gardien */}
          <path d={`M ${goal} ${H / 2 - 12} H ${goal - dir * 10} V ${H / 2 + 12} H ${goal}`} stroke="#dc2626" strokeWidth="1.2" />
          <path d={`M ${goal} ${H / 2 - 18} A 18 18 0 0 ${dir === 1 ? 1 : 0} ${goal} ${H / 2 + 18} Z`} fill="#bfdbfe" fillOpacity="0.7" stroke="#dc2626" strokeWidth="1.2" />
          {/* Cercles de mise au jeu de zone */}
          {[41, 129].map((cy) => (
            <g key={cy}>
              <circle cx={goal + dir * 40} cy={cy} r="30" stroke="#dc2626" strokeWidth="1.2" />
              <circle cx={goal + dir * 40} cy={cy} r="2.6" fill="#dc2626" stroke="none" />
            </g>
          ))}
        </g>
      ))}
      {/* Points de mise au jeu de la zone neutre */}
      {[160, 240].map((cx) =>
        [41, 129].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.6" fill="#dc2626" stroke="none" />)
      )}
    </g>
  );
}

/**
 * Patinoire interactive : on y place des numéros de joueurs et on les déplace au
 * doigt ou à la souris. Utilisée pour la disposition d'une équipe en avantage
 * numérique (PP) et en désavantage numérique (PK).
 */
export default function FormationMap({
  kind,
  title,
  subtitle,
  value,
  onChange,
  waveLabels,
  wave = 0,
  onWave,
  roster,
}: {
  kind: Kind;
  title: string;
  subtitle: string;
  value: FormationValue;
  onChange: (next: FormationValue) => void;
  /** Vagues (ex. ["PP1", "PP2"]) : un bouton par vague pour passer de l'une à l'autre. */
  waveLabels?: string[];
  wave?: number;
  onWave?: (i: number) => void;
  /** Nos joueurs : une pastille par joueur, un clic le pose sur la glace avec son numéro. */
  roster?: { number: string; name: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const { W, H } = dimsOf(kind);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [newNumber, setNewNumber] = useState("");
  const selected = value.markers.find((m) => m.id === selectedId) ?? null;
  // Outils : déplacer les joueurs, ou dessiner une flèche (trait plein) / une passe (pointillé).
  const [tool, setTool] = useState<"move" | "arrow" | "pass">("move");
  const [drawing, setDrawing] = useState<{ x1: number; y1: number; x2: number; y2: number; pts: [number, number][] } | null>(null);
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null);
  const [bend, setBend] = useState<{ id: string; x: number; y: number } | null>(null);
  const arrowsRaw = value.arrows ?? [];
  const arrows = bend
    ? arrowsRaw.map((a) => (a.id === bend.id ? { ...a, pts: undefined, cx: 2 * bend.x - (a.x1 + a.x2) / 2, cy: 2 * bend.y - (a.y1 + a.y2) / 2 } : a))
    : arrowsRaw;
  const arrowMarkerId = `ah${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // Touche Supprimer / Retour arrière : retire la flèche ou la passe sélectionnée.
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (!selectedArrowId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      const v = valueRef.current;
      onChange({ ...v, arrows: (v.arrows ?? []).filter((a) => a.id !== selectedArrowId) });
      setSelectedArrowId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArrowId]);

  function toSvg(e: React.PointerEvent) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: Math.max(8, Math.min(W - 8, p.x)), y: Math.max(8, Math.min(H - 8, p.y)) };
  }

  function update(markers: FormationMarker[]) {
    onChange({ ...value, markers });
  }

  function addMarker(number: string) {
    const n = value.markers.length;
    const m: FormationMarker = { id: uid(), number: number.trim().slice(0, 3), x: 30 + ((n * 37) % 110), y: 40 + ((n * 23) % 80) };
    update([...value.markers, m]);
    setSelectedId(m.id);
    setNewNumber("");
  }

  function applyPreset(i: number) {
    const positions = PRESETS[kind][i].positions;
    const markers = positions.map(([x, y], idx) => ({
      id: value.markers[idx]?.id ?? uid(),
      number: value.markers[idx]?.number ?? "",
      x,
      y,
    }));
    // Les joueurs en trop (au-delà du modèle) restent là où ils sont.
    onChange({ ...value, markers: [...markers, ...value.markers.slice(positions.length)] });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {waveLabels && onWave && (
          <div className="inline-flex rounded-lg overflow-hidden border border-slate-300">
            {waveLabels.map((l, i) => (
              <button
                key={l}
                onClick={() => {
                  setSelectedId(null);
                  setEditingId(null);
                  onWave(i);
                }}
                className={`px-3 py-1.5 text-sm font-black ${wave === i ? "bg-gold-500 text-ink-900" : "bg-white text-slate-600 hover:bg-slate-100"}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {roster && roster.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {roster.map((r) => {
            const placed = value.markers.some((m) => m.number === r.number);
            return (
              <button
                key={r.number}
                type="button"
                onClick={() => !placed && addMarker(r.number)}
                title={placed ? "Déjà sur la glace" : "Poser ce joueur sur la glace"}
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                  placed ? "border-slate-200 bg-slate-100 text-slate-400" : "border-gold-400 bg-gold-50 text-ink-900 hover:bg-gold-100"
                }`}
              >
                {r.number} {r.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS[kind].length > 0 && (
        <select className="input w-auto text-xs" value="" onChange={(e) => e.target.value !== "" && applyPreset(Number(e.target.value))}>
            <option value="">Modèle…</option>
            {PRESETS[kind].map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {kind !== "pk" && (
        <input
            className="input w-24 text-xs"
            inputMode="numeric"
            placeholder="# joueur"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onKeyDown={(e) => e.key === "Enter" && addMarker(newNumber)}
          />
        )}
        <button className="btn-secondary text-xs" onClick={() => addMarker(newNumber)}>
          {kind === "pk" ? "+ Ajouter un joueur" : "+ Ajouter"}
        </button>
        {selected && (
          <button
            className="text-xs text-red-600 hover:underline"
            onClick={() => {
              update(value.markers.filter((m) => m.id !== selected.id));
              setSelectedId(null);
              setEditingId(null);
            }}
          >
            Retirer le joueur sélectionné
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg overflow-hidden border border-slate-300 text-xs font-bold">
          {(
            [
              ["move", "✋ Déplacer"],
              ["arrow", "➜ Flèche"],
              ["pass", "⇢ Passe"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => {
                setTool(t);
                setSelectedId(null);
                setEditingId(null);
                setSelectedArrowId(null);
              }}
              className={`px-3 py-1.5 ${tool === t ? "bg-gold-500 text-ink-900" : "bg-white text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tool === "move" && selectedArrowId && <span className="text-xs text-slate-500">Glisse le point bleu pour courber.</span>}
        {tool !== "move" && <span className="text-xs text-slate-500">Glisse sur la glace pour tracer : la flèche suit ton geste (droit ou courbe).</span>}
        {selectedArrowId && (
          <button
            className="text-xs text-red-600 hover:underline"
            onClick={() => {
              onChange({ ...value, arrows: arrows.filter((a) => a.id !== selectedArrowId) });
              setSelectedArrowId(null);
            }}
          >
            Retirer la flèche sélectionnée (Suppr)
          </button>
        )}
        {arrows.length > 0 && (
          <button
            className="text-xs text-slate-500 hover:underline"
            onClick={() => {
              if (window.confirm("Effacer toutes les flèches de cette patinoire ?")) {
                onChange({ ...value, arrows: [] });
                setSelectedArrowId(null);
              }
            }}
          >
            Effacer les flèches
          </button>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full ${isFull(kind) ? "max-w-[18rem]" : "max-w-md"} mx-auto touch-none select-none`}
        onPointerMove={(e) => {
          if (bend) { setBend({ ...bend, ...toSvg(e) }); return; }
          if (drawing) {
            const p = toSvg(e);
            const last = drawing.pts[drawing.pts.length - 1];
            const pts = Math.hypot(p.x - last[0], p.y - last[1]) > 3 ? [...drawing.pts, [p.x, p.y] as [number, number]] : drawing.pts;
            setDrawing({ ...drawing, x2: p.x, y2: p.y, pts });
          }
          else if (drag) setDrag({ id: drag.id, ...toSvg(e) });
        }}
        onPointerUp={() => {
          if (bend) {
            onChange({ ...value, arrows: arrows.map((a) => ({ ...a })) });
            setBend(null);
            return;
          }
          if (drawing) {
            if (Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) > 8) {
              const { pts: raw, ...line } = drawing;
              // Écart maximal du tracé par rapport à la droite : en dessous, c'est une flèche droite.
              const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
              const dev = Math.max(
                ...raw.map(([px, py]) => Math.abs((line.x2 - line.x1) * (line.y1 - py) - (line.x1 - px) * (line.y2 - line.y1)) / len)
              );
              let pts: [number, number][] | undefined;
              if (dev > 6 && raw.length > 2) {
                const step = Math.max(1, Math.ceil(raw.length / 24));
                pts = raw.filter((_, i) => i % step === 0 || i === raw.length - 1).map(([px, py]) => [Math.round(px), Math.round(py)]);
                if (pts.length > 1) pts[pts.length - 1] = [line.x2, line.y2];
              }
              const a: FormationArrow = { id: uid(), ...line, dashed: tool === "pass", pts };
              onChange({ ...value, arrows: [...arrows, a] });
              setSelectedArrowId(a.id); // reste sélectionnée : Suppr ou le bouton la retire sans changer d'outil
            }
            setDrawing(null);
            return;
          }
          if (drag) {
            const m0 = value.markers.find((m) => m.id === drag.id);
            const moved = m0 ? Math.hypot(drag.x - m0.x, drag.y - m0.y) : 0;
            // Un simple clic (sans glisser) ouvre la saisie du numéro directement sur le rond.
            if (moved < 2) {
              if (kind !== "pk") setEditingId(drag.id);
            }
            else update(value.markers.map((m) => (m.id === drag.id ? { ...m, x: drag.x, y: drag.y } : m)));
          }
          setDrag(null);
        }}
        onPointerLeave={() => {
          if (bend) {
            onChange({ ...value, arrows: arrows.map((a) => ({ ...a })) });
            setBend(null);
            return;
          }
          if (drag) update(value.markers.map((m) => (m.id === drag.id ? { ...m, x: drag.x, y: drag.y } : m)));
          setDrag(null);
        }}
        onPointerDown={(e) => {
          if (tool !== "move") {
            // Outil flèche : le trait commence là où l'on appuie (même sur un joueur).
            const p = toSvg(e);
            e.currentTarget.setPointerCapture(e.pointerId);
            setSelectedArrowId(null);
            setDrawing({ x1: p.x, y1: p.y, x2: p.x, y2: p.y, pts: [[p.x, p.y]] });
            return;
          }
          if (e.target === e.currentTarget) {
            setSelectedId(null);
            setSelectedArrowId(null);
          }
        }}
      >
        <ArrowDefs id={arrowMarkerId} />
        {isFull(kind) ? <FullRink /> : <Rink flip={isFlip(kind)} />}
        {[...arrows, ...(drawing ? [{ id: "__drawing", ...drawing, dashed: tool === "pass" }] : [])].map((a) => {
          const sel = a.id === selectedArrowId;
          return (
            <g key={a.id}>
              <path
                d={arrowPath(a)}
                fill="none"
                stroke={sel ? "#2563eb" : "#111827"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={a.dashed ? "5 3" : undefined}
                markerEnd={`url(#${arrowMarkerId})`}
              />
              {a.id !== "__drawing" && tool === "move" && (
                // Zone de sélection plus large : toucher la flèche la sélectionne.
                <path
                  d={arrowPath(a)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="12"
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedArrowId(a.id);
                    setSelectedId(null);
                  }}
                />
              )}
              {sel && a.id !== "__drawing" && tool === "move" && (
                // Poignée : glisser pour courber la flèche ou la passe.
                <circle
                  cx={arrowMid(a as FormationArrow).x}
                  cy={arrowMid(a as FormationArrow).y}
                  r="5"
                  fill="#2563eb"
                  stroke="#fff"
                  strokeWidth="1.5"
                  className="cursor-grab"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    svgRef.current?.setPointerCapture(e.pointerId);
                    setBend({ id: a.id, ...arrowMid(a as FormationArrow) });
                  }}
                />
              )}
            </g>
          );
        })}
        {value.markers.map((m) => {
          const pos = drag?.id === m.id ? drag : m;
          const isSel = m.id === selectedId;
          return (
            <g
              key={m.id}
              transform={`translate(${pos.x} ${pos.y})`}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                if (tool !== "move") return; // l'outil flèche laisse le geste à la glace
                e.stopPropagation();
                setSelectedArrowId(null);
                (e.currentTarget as SVGGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
                setSelectedId(m.id);
                setDrag({ id: m.id, x: m.x, y: m.y });
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setDrag(null);
                setSelectedId(m.id);
                // Le PK adverse n'a jamais de numéros : des X seulement.
                if (kind !== "pk") setEditingId(m.id);
              }}
            >
              {isSel && <circle r="10.5" fill="none" stroke="#2563eb" strokeWidth="1.6" strokeDasharray="3 2" />}
              <circle r="7" fill={m.number ? "#fdca37" : "#cbd5e1"} stroke="#0d0c0c" strokeWidth="1.3" />
              {editingId === m.id ? (
                // Double-clic : on tape le numéro directement sur le rond.
                <foreignObject x={-10} y={-6} width={20} height={12}>
                  <input
                    autoFocus
                    inputMode="numeric"
                    value={m.number}
                    onFocus={(e) => e.currentTarget.select()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      update(value.markers.map((x) => (x.id === m.id ? { ...x, number: e.target.value.replace(/\D/g, "").slice(0, 3) } : x)))
                    }
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
                    style={{ width: "100%", height: "100%", textAlign: "center", fontWeight: 900, fontSize: 8.5, border: "none", outline: "none", borderRadius: 4, background: "#fff", padding: 0 }}
                  />
                </foreignObject>
              ) : (
                <text textAnchor="middle" dominantBaseline="central" fontSize={m.number.length > 2 ? 5.8 : 7.5} fontWeight="900" fill="#0d0c0c">
                  {m.number || "X"}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <textarea
        className="input"
        rows={2}
        placeholder="Remarques (ex. : le 71 tire des poignets du cercle gauche…)"
        value={value.note}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
      />
    </div>
  );
}

/** Version imprimable (sans commandes) : la patinoire, les numéros posés et les remarques. */
export function FormationStatic({ kind, value }: { kind: Kind; value: FormationValue }) {
  const { W, H } = dimsOf(kind);
  const staticMarkerId = `ahs${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ breakInside: "avoid", maxWidth: isFull(kind) ? "75mm" : undefined }}>
        <ArrowDefs id={staticMarkerId} />
        {isFull(kind) ? <FullRink /> : <Rink flip={isFlip(kind)} />}
        {(value.arrows ?? []).map((a) => (
          <path key={a.id} d={arrowPath(a)} fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeDasharray={a.dashed ? "5 3" : undefined} markerEnd={`url(#${staticMarkerId})`} />
        ))}
        {value.markers.map((m) => (
          <g key={m.id} transform={`translate(${m.x} ${m.y})`}>
            <circle r="7" fill={m.number ? "#fdca37" : "#e2e8f0"} stroke="#0d0c0c" strokeWidth="1.3" />
            <text textAnchor="middle" dominantBaseline="central" fontSize={m.number.length > 2 ? 5.8 : 7.5} fontWeight="900" fill="#0d0c0c">
              {m.number || "X"}
            </text>
          </g>
        ))}
      </svg>
      {value.note.trim() && <p className="mt-1 text-[10pt] whitespace-pre-line border-l-4 border-black pl-2">{value.note}</p>}
    </div>
  );
}
