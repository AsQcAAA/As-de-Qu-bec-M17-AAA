"use client";

import { useRef, useState } from "react";

export interface FormationMarker {
  id: string;
  number: string;
  x: number;
  y: number;
}

export interface FormationValue {
  markers: FormationMarker[];
  note: string;
}

const W = 170;
const H = 178;

/** Modèles de départ : positions seulement ; les numéros déjà saisis sont conservés dans l'ordre. */
const PRESETS: Record<"pp" | "pk", { label: string; positions: [number, number][] }[]> = {
  pp: [
    { label: "Spread", positions: [[45, 142], [125, 142], [24, 96], [146, 96], [85, 66]] },
    { label: "Overload", positions: [[85, 143], [24, 106], [144, 104], [41, 23], [85, 43]] },
    { label: "1-3-1", positions: [[85, 140], [22, 94], [85, 94], [148, 94], [85, 45]] },
    { label: "Umbrella", positions: [[85, 136], [21, 110], [150, 108], [67, 39], [106, 38]] },
  ],
  pk: [
    { label: "Boîte", positions: [[58, 70], [112, 70], [58, 104], [112, 104]] },
    { label: "Losange", positions: [[85, 58], [52, 88], [118, 88], [85, 118]] },
    { label: "Triangle + 1", positions: [[85, 56], [58, 92], [112, 92], [85, 124]] },
  ],
};

const uid = () => Math.random().toString(36).slice(2, 9);

export const emptyFormation = (kind: "pp" | "pk"): FormationValue => ({
  markers: PRESETS[kind][0].positions.map(([x, y]) => ({ id: uid(), number: "", x, y })),
  note: "",
});

/** Demi-patinoire (zone offensive de l'équipe, but en haut), proportions réelles : 2 unités = 1 pied. */
function Rink() {
  return (
    <g fill="none" strokeLinecap="round">
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
}: {
  kind: "pp" | "pk";
  title: string;
  subtitle: string;
  value: FormationValue;
  onChange: (next: FormationValue) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [newNumber, setNewNumber] = useState("");
  const selected = value.markers.find((m) => m.id === selectedId) ?? null;

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
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto text-xs" value="" onChange={(e) => e.target.value !== "" && applyPreset(Number(e.target.value))}>
          <option value="">Modèle…</option>
          {PRESETS[kind].map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          className="input w-24 text-xs"
          inputMode="numeric"
          placeholder="# joueur"
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value.replace(/\D/g, "").slice(0, 3))}
          onKeyDown={(e) => e.key === "Enter" && addMarker(newNumber)}
        />
        <button className="btn-secondary text-xs" onClick={() => addMarker(newNumber)}>
          + Ajouter
        </button>
        {selected && (
          <>
            <span className="text-xs text-slate-500">Sélectionné :</span>
            <input
              className="input w-20 text-xs"
              inputMode="numeric"
              placeholder="#"
              value={selected.number}
              onChange={(e) =>
                update(value.markers.map((m) => (m.id === selected.id ? { ...m, number: e.target.value.replace(/\D/g, "").slice(0, 3) } : m)))
              }
            />
            <button
              className="text-xs text-red-600 hover:underline"
              onClick={() => {
                update(value.markers.filter((m) => m.id !== selected.id));
                setSelectedId(null);
              }}
            >
              Retirer
            </button>
          </>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-md mx-auto touch-none select-none"
        onPointerMove={(e) => drag && setDrag({ id: drag.id, ...toSvg(e) })}
        onPointerUp={() => {
          if (drag) update(value.markers.map((m) => (m.id === drag.id ? { ...m, x: drag.x, y: drag.y } : m)));
          setDrag(null);
        }}
        onPointerLeave={() => {
          if (drag) update(value.markers.map((m) => (m.id === drag.id ? { ...m, x: drag.x, y: drag.y } : m)));
          setDrag(null);
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        <Rink />
        {value.markers.map((m) => {
          const pos = drag?.id === m.id ? drag : m;
          const isSel = m.id === selectedId;
          return (
            <g
              key={m.id}
              transform={`translate(${pos.x} ${pos.y})`}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as SVGGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
                setSelectedId(m.id);
                setDrag({ id: m.id, x: m.x, y: m.y });
              }}
            >
              {isSel && <circle r="13" fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="3 2" />}
              <circle r="10" fill={m.number ? "#fdca37" : "#cbd5e1"} stroke="#0d0c0c" strokeWidth="1.6" />
              <text textAnchor="middle" dominantBaseline="central" fontSize={m.number.length > 2 ? 8 : 10} fontWeight="900" fill="#0d0c0c">
                {m.number || "?"}
              </text>
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
