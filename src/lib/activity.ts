// Suivi d'activité des coachs : clics et caractères ajoutés (compteurs seulement, jamais le contenu).

export interface ActivityRow {
  user_id: string;
  day: string;
  clicks: number;
  chars: number;
}

export interface CoachTotal {
  id: string;
  name: string;
  clicks: number;
  chars: number;
  activeDays: number;
}

export const MEDALS = ["🥇", "🥈", "🥉"] as const;

export const fmtNum = (n: number) => n.toLocaleString("fr-CA");

/** Totaux du mois par coach (les coachs sans activité figurent avec des zéros). */
export function totalsByCoach(rows: ActivityRow[], coaches: { id: string; full_name: string }[]): CoachTotal[] {
  const map = new Map<string, CoachTotal>(coaches.map((c) => [c.id, { id: c.id, name: c.full_name, clicks: 0, chars: 0, activeDays: 0 }]));
  for (const r of rows) {
    const t = map.get(r.user_id);
    if (!t) continue;
    t.clicks += r.clicks;
    t.chars += r.chars;
    if (r.clicks > 0 || r.chars > 0) t.activeDays += 1;
  }
  return [...map.values()];
}

/** Classement décroissant ; à égalité, l'ordre alphabétique. */
export function rankBy(totals: CoachTotal[], key: "clicks" | "chars"): CoachTotal[] {
  return [...totals].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name, "fr"));
}

/** « 2026-11 » → bornes [début du mois, début du mois suivant[ au format AAAA-MM-JJ. */
export function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${ym}-01`, to: `${next}-01` };
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-CA", { month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
