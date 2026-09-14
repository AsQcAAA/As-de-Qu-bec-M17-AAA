import type { TpeFaceoffLine, TpeFaceoffZoneGrid } from "@/lib/tpeReport";

/**
 * Reproduit le diagramme « Face-Offs by zones » du rapport TPE : les 9 ronds
 * de mise au jeu positionnés sur une patinoire, colorés selon le taux de
 * réussite — bleu au-dessus de 50 %, rouge en dessous, plus la teinte est
 * soutenue plus l'écart avec 50 % est grand.
 */
export default function FaceoffZoneHeatmap({ grid, total }: { grid: TpeFaceoffZoneGrid; total: TpeFaceoffLine }) {
  const dots: { key: keyof TpeFaceoffZoneGrid; x: number; y: number }[] = [
    { key: "dzTop", x: 100, y: 95 },
    { key: "dzBottom", x: 100, y: 205 },
    { key: "nzDefTop", x: 253, y: 95 },
    { key: "nzDefBottom", x: 253, y: 205 },
    { key: "center", x: 350, y: 150 },
    { key: "nzOffTop", x: 447, y: 95 },
    { key: "nzOffBottom", x: 447, y: 205 },
    { key: "ozTop", x: 600, y: 95 },
    { key: "ozBottom", x: 600, y: 205 },
  ];

  function pct(l: TpeFaceoffLine): number | null {
    return l.won + l.lost > 0 ? (l.won / (l.won + l.lost)) * 100 : null;
  }

  function color(p: number | null): string {
    if (p === null) return "#e2e8f0";
    const diff = Math.min(1, Math.abs(p - 50) / 40);
    return p >= 50 ? `rgba(37, 99, 235, ${0.12 + diff * 0.35})` : `rgba(220, 38, 38, ${0.12 + diff * 0.35})`;
  }

  const totalPct = pct(total);

  return (
    <svg viewBox="0 0 700 300" className="w-full h-auto">
      {/* Patinoire. */}
      <rect x="20" y="20" width="660" height="260" rx="60" fill="none" stroke="#94a3b8" strokeWidth="2" />
      <line x1="253" y1="20" x2="253" y2="280" stroke="#3b82f6" strokeWidth="2" />
      <line x1="447" y1="20" x2="447" y2="280" stroke="#3b82f6" strokeWidth="2" />
      <line x1="350" y1="20" x2="350" y2="280" stroke="#ef4444" strokeWidth="1.5" />
      <line x1="26" y1="20" x2="26" y2="280" stroke="#ef4444" strokeWidth="2" />
      <line x1="674" y1="20" x2="674" y2="280" stroke="#ef4444" strokeWidth="2" />
      <text x="45" y="150" fontSize="11" fontWeight="bold" fill="#64748b" textAnchor="middle" transform="rotate(-90 45 150)">
        DZ
      </text>
      <text x="655" y="150" fontSize="11" fontWeight="bold" fill="#64748b" textAnchor="middle" transform="rotate(90 655 150)">
        OZ
      </text>

      {/* Case TOTAL, au-dessus du rond central. */}
      <rect x="322" y="34" width="56" height="34" rx="4" fill="#e2e8f0" />
      <text x="350" y="45" fontSize="8" fontWeight="bold" fill="#64748b" textAnchor="middle">
        TOTAL
      </text>
      <text x="350" y="57" fontSize="12" fontWeight="bold" fill="#1e293b" textAnchor="middle">
        {totalPct === null ? "-" : `${totalPct.toFixed(0)}%`}
      </text>
      <text x="350" y="66" fontSize="7" fill="#3b82f6" textAnchor="middle">
        {total.won} <tspan fill="#ef4444">/ {total.lost}</tspan>
      </text>

      {dots.map(({ key, x, y }) => {
        const line = grid[key];
        const p = pct(line);
        return (
          <g key={key}>
            <circle cx={x} cy={y} r="34" fill={color(p)} stroke="#cbd5e1" strokeWidth="1" />
            <text x={x} y={y - 4} fontSize="13" fontWeight="bold" fill="#1e293b" textAnchor="middle">
              {p === null ? "-" : `${p.toFixed(0)}%`}
            </text>
            <text x={x} y={y + 12} fontSize="9" textAnchor="middle">
              <tspan fill="#2563eb">{line.won}</tspan>
              <tspan fill="#64748b"> / </tspan>
              <tspan fill="#dc2626">{line.lost}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
