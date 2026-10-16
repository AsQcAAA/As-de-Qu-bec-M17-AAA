// Fiche des tests physiques d'un joueur : son résultat à chaque test, son
// classement dans l'équipe et l'évolution par rapport à la séance précédente.
// Utilisée par l'aperçu (navigateur) ET par l'envoi des courriels (serveur) :
// le serveur recalcule tout à partir de la base, jamais à partir de ce que
// le navigateur lui dit.

export interface TestResultLike {
  player_id: string;
  test_name: string;
  value: number;
  unit: string | null;
  higher_is_better: boolean;
  test_date: string;
}

export interface FicheRow {
  test: string;
  unit: string | null;
  value: number;
  rank: number;
  total: number;
  prevValue: number | null;
  delta: number | null;
  improved: boolean | null;
}

export interface Fiche {
  sessionDate: string;
  sessionLabel: string;
  previousDate: string | null;
  previousLabel: string | null;
  rows: FicheRow[];
}

// La grandeur assise n'est pas une performance : pas de classement.
const EXCLUDED = new Set(["Grandeur assise"]);
const ORDER = [
  "Pallier 30-15",
  "Saut horizontal",
  "Lancer de ballon",
  "Chin up",
  "Bench press @ 75% BW",
  "Agilité 5-10-5 R",
  "Agilité 5-10-5 L",
  "Sprint 30 m (1)",
  "Sprint 30 m (2)",
];

/** A26 = automne 2026, H27 = hiver 2027, P26 = printemps 2026. */
export function sessionLabel(date: string, allDates: string[]): string {
  const seasonOf = (d: string) => {
    const m = Number(d.slice(5, 7));
    return `${m >= 8 ? "A" : m <= 3 ? "H" : "P"}${d.slice(2, 4)}`;
  };
  const same = allDates.filter((d) => seasonOf(d) === seasonOf(date)).length;
  return same > 1 ? date : seasonOf(date);
}

export function computeFiche(playerId: string, sessionDate: string, results: TestResultLike[], eligible: Set<string>): Fiche {
  const dates = [...new Set(results.map((r) => r.test_date))].sort();
  const previousDate = [...dates].reverse().find((d) => d < sessionDate) ?? null;
  const rows: FicheRow[] = [];
  const tests = [...new Set(results.filter((r) => r.test_date === sessionDate).map((r) => r.test_name))].filter((t) => !EXCLUDED.has(t));
  tests.sort((a, b) => (ORDER.indexOf(a) === -1 ? 99 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 99 : ORDER.indexOf(b)) || a.localeCompare(b));
  for (const test of tests) {
    const session = results.filter((r) => r.test_name === test && r.test_date === sessionDate && eligible.has(r.player_id));
    const mine = session.find((r) => r.player_id === playerId);
    if (!mine) continue;
    const better = session.filter((r) => (mine.higher_is_better ? r.value > mine.value : r.value < mine.value)).length;
    const prev = previousDate
      ? results.find((r) => r.test_name === test && r.test_date === previousDate && r.player_id === playerId)
      : undefined;
    const delta = prev ? Math.round((mine.value - prev.value) * 1000) / 1000 : null;
    rows.push({
      test,
      unit: mine.unit,
      value: mine.value,
      rank: better + 1,
      total: session.length,
      prevValue: prev?.value ?? null,
      delta,
      improved: delta === null || delta === 0 ? null : mine.higher_is_better ? delta > 0 : delta < 0,
    });
  }
  return {
    sessionDate,
    sessionLabel: sessionLabel(sessionDate, dates),
    previousDate,
    previousLabel: previousDate ? sessionLabel(previousDate, dates) : null,
    rows,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const withUnit = (n: number, unit: string | null) => `${fmt(n)}${unit ? ` ${unit}` : ""}`;

/** Fiche en HTML compatible avec les messageries (tableaux, styles en ligne). */
export function ficheHtml(playerName: string, fiche: Fiche): string {
  const th = "padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #e5e7eb;";
  const td = "padding:9px 10px;border-bottom:1px solid #eef0f3;font-size:14px;";
  const body = fiche.rows
    .map((r, i) => {
      const third = r.total / 3;
      const rankColor = r.rank <= Math.ceil(third) ? "#166534" : r.rank > r.total - Math.ceil(third) ? "#b91c1c" : "#374151";
      const rankBg = r.rank <= Math.ceil(third) ? "#dcfce7" : r.rank > r.total - Math.ceil(third) ? "#fee2e2" : "#f3f4f6";
      const evo =
        r.delta === null
          ? `<span style="color:#9ca3af;">—</span>`
          : r.delta === 0
            ? `<span style="color:#6b7280;">= identique</span>`
            : `<span style="font-weight:bold;color:${r.improved ? "#15803d" : "#b91c1c"};">${r.improved ? "▲" : "▼"} ${r.delta > 0 ? "+" : ""}${fmt(r.delta)}</span>`;
      return `<tr style="background:${i % 2 ? "#fafafa" : "#ffffff"};">
<td style="${td}font-weight:bold;">${esc(r.test)}</td>
<td style="${td}text-align:right;font-weight:bold;">${esc(withUnit(r.value, r.unit))}</td>
<td style="${td}text-align:center;"><span style="display:inline-block;padding:2px 9px;border-radius:10px;background:${rankBg};color:${rankColor};font-weight:bold;">${r.rank}<span style="font-weight:normal;"> / ${r.total}</span></span></td>
<td style="${td}text-align:right;color:#6b7280;">${r.prevValue === null ? "—" : esc(withUnit(r.prevValue, r.unit))}</td>
<td style="${td}text-align:right;">${evo}</td>
</tr>`;
    })
    .join("");
  const prev = fiche.previousLabel ?? "séance précédente";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="padding:14px 16px;background:#0d0c0c;border-radius:8px 8px 0 0;">
<div style="font-size:11px;letter-spacing:.12em;color:#fdca37;font-weight:bold;">AS DE QUÉBEC M17 AAA — TESTS PHYSIQUES ${esc(fiche.sessionLabel)}</div>
<div style="font-size:20px;color:#ffffff;font-weight:bold;margin-top:2px;">${esc(playerName)}</div>
</td></tr>
<tr><td style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
<tr><th style="${th}">Test</th><th style="${th}text-align:right;">${esc(fiche.sessionLabel)}</th><th style="${th}text-align:center;">Classement</th><th style="${th}text-align:right;">${esc(prev)}</th><th style="${th}text-align:right;">Évolution</th></tr>
${body}
</table>
</td></tr>
<tr><td style="padding:10px 16px;font-size:12px;color:#6b7280;">Classement parmi les joueurs de l'équipe ayant fait le test. Vert = tiers supérieur, rouge = tiers inférieur. L'évolution compare à ${esc(prev)} : ▲ amélioration, ▼ recul (pour un temps, moins est mieux).</td></tr>
</table>`;
}
