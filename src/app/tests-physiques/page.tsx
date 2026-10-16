"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { lastName } from "@/lib/players";
import type { Player, PlayerTestResult } from "@/lib/types";

/** Note marquant un résultat obtenu par un joueur blessé — affiché par un emoji dans le tableau. */
const INJURED_NOTE = "Blessé lors du test";

export default function TestsPhysiquesPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [results, setResults] = useState<PlayerTestResult[]>([]);
  const [loading, setLoading] = useState(true);


  async function load() {
    const [{ data: pls }, { data: res }] = await Promise.all([
      supabase.from("players").select("*").eq("is_call_up", false),
      supabase.from("player_test_results").select("*").order("test_date", { ascending: false }),
    ]);
    setPlayers(pls ?? []);
    setResults(res ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  /** Séances de tests, de la plus ancienne à la plus récente. */
  const sessionDates = useMemo(() => [...new Set(results.map((r) => r.test_date))].sort(), [results]);

  /**
   * Titre d'une séance : la saison plutôt que la date exacte (A26 = automne 2026, H27 = hiver 2027, P26 = printemps 2026). Si deux séances tombent dans la
   * même saison, on retombe sur la date pour les distinguer.
   */
  const sessionLabels = useMemo(() => {
    const seasonOf = (date: string) => {
      const month = Number(date.slice(5, 7));
      const letter = month >= 8 ? "A" : month <= 3 ? "H" : "P";
      return `${letter}${date.slice(2, 4)}`;
    };
    const counts = new Map<string, number>();
    for (const d of sessionDates) counts.set(seasonOf(d), (counts.get(seasonOf(d)) ?? 0) + 1);
    return new Map(sessionDates.map((d) => [d, (counts.get(seasonOf(d)) ?? 0) > 1 ? d : seasonOf(d)]));
  }, [sessionDates]);

  // Séance affichée : la plus récente tant qu'on n'en choisit pas une autre.
  const [pickedSession, setPickedSession] = useState<string | null>(null);
  const session = pickedSession && sessionDates.includes(pickedSession) ? pickedSession : sessionDates[sessionDates.length - 1] ?? "";
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "__name", desc: false });
  // « rank » : couleurs vert / rouge selon la place dans l'équipe ; « evolution » :
  // résultat de la séance + celui de la séance précédente entre parenthèses et une flèche.
  const [viewMode, setViewMode] = useState<"rank" | "evolution">("rank");
  const previousSession = useMemo(() => {
    const i = sessionDates.indexOf(session);
    return i > 0 ? sessionDates[i - 1] : null;
  }, [sessionDates, session]);
  const showEvolution = viewMode === "evolution" && previousSession !== null;
  /** Résultats de la séance précédente : joueur|test → résultat. */
  const previousResults = useMemo(() => {
    const map = new Map<string, PlayerTestResult>();
    if (!previousSession) return map;
    for (const r of results) if (r.test_date === previousSession) map.set(`${r.player_id}|${r.test_name}`, r);
    return map;
  }, [results, previousSession]);

  /** Tests de la séance, dans un ordre stable (les tests habituels d'abord). */
  const testColumnsOfSession = useMemo(() => {
    const order = ["Pallier 30-15", "Saut horizontal", "Lancer de ballon", "Chin up", "Bench press @ 75% BW", "Agilité 5-10-5 R", "Agilité 5-10-5 L", "Sprint 30 m (1)", "Sprint 30 m (2)", "Grandeur assise"];
    const names = [...new Set(results.filter((r) => r.test_date === session).map((r) => r.test_name))];
    return names.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [results, session]);

  /** Une ligne par joueur ayant au moins un résultat à cette séance. */
  const matrix = useMemo(() => {
    const byPlayer = new Map<string, Map<string, PlayerTestResult>>();
    for (const r of results) {
      if (r.test_date !== session) continue;
      if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, new Map());
      byPlayer.get(r.player_id)!.set(r.test_name, r);
    }
    const rows = [...byPlayer.entries()]
      .map(([playerId, tests]) => ({ player: nameById.get(playerId), playerId, tests }))
      .filter((r) => r.player);

    // Couleur par colonne : du pire (rouge) au meilleur (vert), selon le sens du test.
    const scale = new Map<string, { min: number; max: number; higher: boolean; unit: string | null }>();
    for (const name of testColumnsOfSession) {
      const vals = rows.map((r) => r.tests.get(name)).filter((x): x is PlayerTestResult => !!x);
      if (vals.length === 0) continue;
      scale.set(name, {
        min: Math.min(...vals.map((v) => v.value)),
        max: Math.max(...vals.map((v) => v.value)),
        higher: vals[0].higher_is_better,
        unit: vals[0].unit,
      });
    }

    const valueOf = (r: (typeof rows)[number]) =>
      sort.key === "__name" ? null : r.tests.get(sort.key)?.value ?? null;
    rows.sort((a, b) => {
      if (sort.key === "__name") {
        const cmp = lastName(a.player!.full_name).localeCompare(lastName(b.player!.full_name));
        return sort.desc ? -cmp : cmp;
      }
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // sans résultat : toujours en bas
      if (vb === null) return -1;
      return sort.desc ? vb - va : va - vb;
    });
    return { rows, scale };
  }, [results, session, nameById, testColumnsOfSession, sort]);

  function toggleSort(key: string) {
    setSort((cur) => (cur.key === key ? { key, desc: !cur.desc } : { key, desc: key !== "__name" }));
  }

  /** Fond d'une cellule : vert = meilleur, rouge = pire ; plus c'est extrême, plus c'est soutenu. */
  function cellColor(testName: string, value: number): { bg: string; extreme: "best" | "worst" | null } {
    const sc = matrix.scale.get(testName);
    if (!sc || sc.max === sc.min) return { bg: "transparent", extreme: null };
    let t = (value - sc.min) / (sc.max - sc.min); // 0 = plus bas, 1 = plus haut
    if (!sc.higher) t = 1 - t; // pour un temps, plus bas = meilleur
    const distance = Math.abs(t - 0.5) * 2; // 0 au milieu, 1 aux extrêmes
    const lightness = 95 - 27 * distance;
    return {
      bg: `hsl(${Math.round(t * 120)}, 72%, ${Math.round(lightness)}%)`,
      extreme: t >= 0.999 ? "best" : t <= 0.001 ? "worst" : null,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tests physiques</h1>
        <p className="text-slate-500 text-sm">Classement de l'équipe pour chaque test.</p>
      </div>

      <p className="text-xs text-slate-400">
        Synchronisé automatiquement chaque jour avec le fichier Google Drive des tests (onglet M17) — les nouveaux résultats
        s&apos;ajoutent tout seuls, sans rien écraser.
      </p>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : sessionDates.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun test enregistré pour l'instant. Importe un fichier Excel ci-dessus, ou ajoute des résultats depuis une fiche joueur.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-lg overflow-hidden border border-white/20">
              <button
                className={`px-4 py-2 text-sm font-bold ${viewMode === "rank" ? "bg-gold-500 text-ink-900" : "bg-white/5 text-slate-200 hover:bg-white/10"}`}
                onClick={() => setViewMode("rank")}
              >
                🎨 Classement
              </button>
              <button
                disabled={previousSession === null}
                title={previousSession === null ? "Il faut une séance précédente pour comparer" : undefined}
                className={`px-4 py-2 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed ${
                  showEvolution ? "bg-gold-500 text-ink-900" : "bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
                onClick={() => setViewMode("evolution")}
              >
                📈 Évolution{previousSession ? ` ${sessionLabels.get(previousSession)} → ${sessionLabels.get(session)}` : ""}
              </button>
            </div>
            <label className="text-sm font-semibold text-white">Séance de tests</label>
            <select className="input w-auto" value={session} onChange={(e) => setPickedSession(e.target.value)}>
              {[...sessionDates].reverse().map((d) => (
                <option key={d} value={d}>
                  {sessionLabels.get(d)} — {d}
                </option>
              ))}
            </select>
            {showEvolution ? (
              <span className="text-xs text-slate-300">
                Résultat {sessionLabels.get(session)} <span className="text-slate-400">(résultat {sessionLabels.get(previousSession!)})</span>{" "}
                <span className="font-bold text-green-400">▲ mieux</span> <span className="font-bold text-red-400">▼ moins bien</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                <span className="rounded px-2 py-0.5 font-bold" style={{ background: "hsl(120, 72%, 68%)", color: "#111" }}>
                  meilleur
                </span>
                <span className="rounded px-2 py-0.5 font-bold" style={{ background: "hsl(0, 72%, 68%)", color: "#111" }}>
                  pire
                </span>
                <span className="text-slate-400">par colonne — clique un titre pour trier</span>
              </span>
            )}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-slate-500">
                  <th
                    className="sticky left-0 bg-white py-2 pr-4 cursor-pointer select-none border-b"
                    onClick={() => toggleSort("__name")}
                  >
                    Joueur {sort.key === "__name" ? (sort.desc ? "▼" : "▲") : ""}
                  </th>
                  {testColumnsOfSession.map((name) => (
                    <th
                      key={name}
                      className="py-2 px-3 cursor-pointer select-none whitespace-nowrap border-b text-center hover:text-ink-900"
                      onClick={() => toggleSort(name)}
                      title={matrix.scale.get(name)?.higher === false ? "Moins = mieux" : "Plus = mieux"}
                    >
                      {name}
                      {matrix.scale.get(name)?.unit ? <span className="font-normal text-slate-400"> ({matrix.scale.get(name)!.unit})</span> : null}{" "}
                      {sort.key === name ? (sort.desc ? "▼" : "▲") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.playerId}>
                    <td className="sticky left-0 bg-white py-1.5 pr-4 border-b whitespace-nowrap">
                      <Link href={`/joueurs/${row.playerId}`} className="hover:text-gold-700 hover:underline">
                        {row.player?.jersey_number ? `#${row.player.jersey_number} ` : ""}
                        {row.player?.full_name}
                      </Link>
                    </td>
                    {testColumnsOfSession.map((name) => {
                      const r = row.tests.get(name);
                      if (!r) {
                        return (
                          <td key={name} className="py-1.5 px-3 text-center text-slate-300 border-b">
                            –
                          </td>
                        );
                      }
                      const { bg, extreme } = showEvolution ? { bg: "transparent", extreme: null } : cellColor(name, r.value);
                      const prev = showEvolution ? previousResults.get(`${row.playerId}|${name}`) : undefined;
                      const delta = prev ? Math.round((r.value - prev.value) * 1000) / 1000 : null;
                      const better = delta !== null && (r.higher_is_better ? delta > 0 : delta < 0);
                      return (
                        <td
                          key={name}
                          className={`py-1.5 px-3 text-center border-b tabular-nums ${extreme ? "font-black text-ink-900" : "font-medium"}`}
                          style={{ background: bg }}
                          title={
                            showEvolution && prev
                              ? `${sessionLabels.get(previousSession!)} : ${prev.value} → ${sessionLabels.get(session)} : ${r.value}`
                              : extreme === "best"
                                ? "Meilleur résultat"
                                : extreme === "worst"
                                  ? "Moins bon résultat"
                                  : undefined
                          }
                        >
                          {r.value}
                          {showEvolution && prev && (
                            <>
                              <span className="ml-1 text-xs font-normal text-slate-500">({prev.value})</span>
                              {delta !== 0 && (
                                <span className={`ml-1 font-black ${better ? "text-green-600" : "text-red-600"}`}>{delta! > 0 ? "▲" : "▼"}</span>
                              )}
                              {delta === 0 && <span className="ml-1 text-slate-400">=</span>}
                            </>
                          )}
                          {r.notes === INJURED_NOTE && (
                            <span title={INJURED_NOTE} className="ml-1">
                              🩹
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {results.some((r) => r.test_date === session && r.notes === INJURED_NOTE) && (
              <p className="text-xs text-slate-500 pt-2">🩹 Blessé lors du test</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
