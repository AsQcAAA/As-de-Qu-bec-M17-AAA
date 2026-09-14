"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { lastName } from "@/lib/players";
import { sumFaceoffZoneGrids } from "@/lib/tpeReport";
import FaceoffZoneHeatmap from "@/components/FaceoffZoneHeatmap";
import type { Game, GameCategory, GameDocument, Player, PlayerGameAdvancedStat } from "@/lib/types";

const CATEGORY_LABEL: Record<GameCategory, string> = {
  hors_concours: "Hors concours",
  saison_reguliere: "Saison régulière",
  series: "Séries",
  tournoi: "Tournoi",
};
const CATEGORY_ORDER: GameCategory[] = ["saison_reguliere", "series", "tournoi", "hors_concours"];

/** Une statistique d'équipe compacte. */
function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card space-y-1">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-black text-ink-900">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

/** Une cellule de carte de chaleur : couleur pleine selon l'intensité (0 à 1). */
function HeatCell({ value, intensity, suffix = "" }: { value: number | string; intensity: number; suffix?: string }) {
  const alpha = 0.12 + Math.max(0, Math.min(1, intensity)) * 0.75;
  return (
    <td className="p-0">
      <div
        className="h-full w-full px-2 py-1.5 text-center font-bold tabular-nums"
        style={{ backgroundColor: `rgba(253, 202, 55, ${alpha})`, color: alpha > 0.55 ? "#1a1a1a" : "inherit" }}
      >
        {value}
        {suffix}
      </div>
    </td>
  );
}

type HeatSortKey = "jersey" | "name" | "games" | "shots" | "faceoffsWon" | "faceoffPct";

/** En-tête de colonne cliquable, avec indicateur de sens (▲▼↕). */
function SortHeader({
  label,
  k,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  k: HeatSortKey;
  sort: { key: HeatSortKey; desc: boolean };
  onSort: (k: HeatSortKey) => void;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`cursor-pointer select-none whitespace-nowrap ${active ? "text-gold-700" : "hover:text-slate-700"} ${className}`}
    >
      {label} <span className="text-[10px]">{active ? (sort.desc ? "▼" : "▲") : "↕"}</span>
    </th>
  );
}

interface HeatRow {
  player: Player;
  shots: number;
  faceoffsWon: number;
  faceoffPct: number | null;
  games: number;
}

function sortHeatRows(rows: HeatRow[], sort: { key: HeatSortKey; desc: boolean }): HeatRow[] {
  const sorted = [...rows].sort((a, b) => {
    switch (sort.key) {
      case "jersey":
        return (a.player.jersey_number ?? 0) - (b.player.jersey_number ?? 0);
      case "name":
        return lastName(a.player.full_name).localeCompare(lastName(b.player.full_name));
      case "games":
        return a.games - b.games;
      case "shots":
        return a.shots - b.shots;
      case "faceoffsWon":
        return a.faceoffsWon - b.faceoffsWon;
      case "faceoffPct":
        return (a.faceoffPct ?? -1) - (b.faceoffPct ?? -1);
    }
  });
  return sort.desc ? sorted.reverse() : sorted;
}

export default function StatistiquesAvanceesPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [advancedStats, setAdvancedStats] = useState<PlayerGameAdvancedStat[]>([]);
  const [reportDocs, setReportDocs] = useState<GameDocument[]>([]);
  const [categories, setCategories] = useState<Set<GameCategory>>(new Set(CATEGORY_ORDER));
  const [loading, setLoading] = useState(true);
  const [sortF, setSortF] = useState<{ key: HeatSortKey; desc: boolean }>({ key: "shots", desc: true });
  const [sortD, setSortD] = useState<{ key: HeatSortKey; desc: boolean }>({ key: "shots", desc: true });

  function toggleSort(current: { key: HeatSortKey; desc: boolean }, set: (s: { key: HeatSortKey; desc: boolean }) => void, k: HeatSortKey) {
    if (current.key === k) set({ key: k, desc: !current.desc });
    else set({ key: k, desc: k !== "name" });
  }

  useEffect(() => {
    async function load() {
      const [{ data: pls }, { data: gms }, { data: adv }, { data: docs }] = await Promise.all([
        supabase.from("players").select("*").eq("active", true).neq("position", "G").order("jersey_number"),
        supabase.from("games").select("*"),
        supabase.from("player_game_advanced_stats").select("*"),
        supabase.from("game_documents").select("*").eq("doc_type", "stats_avancees").order("uploaded_at", { ascending: false }),
      ]);
      setPlayers(pls ?? []);
      setGames(gms ?? []);
      setAdvancedStats(adv ?? []);
      setReportDocs(docs ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function toggleCategory(c: GameCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const filteredGames = useMemo(
    () => games.filter((g) => g.result && categories.has(g.category)),
    [games, categories]
  );
  const filteredGameIds = useMemo(() => new Set(filteredGames.map((g) => g.id)), [filteredGames]);
  const filteredStats = useMemo(
    () => advancedStats.filter((a) => filteredGameIds.has(a.game_id)),
    [advancedStats, filteredGameIds]
  );

  // ---- Résumé d'équipe, sur les mêmes matchs que le filtre. ----
  const teamSummary = useMemo(() => {
    const withShots = filteredGames.filter((g) => g.shots_on_goal_us != null);
    const shotsFor = withShots.reduce((n, g) => n + (g.shots_on_goal_us ?? 0), 0);
    const shotsAgainst = withShots.reduce((n, g) => n + (g.shots_on_goal_opponent ?? 0), 0);
    const withFaceoffs = filteredGames.filter((g) => g.faceoffs_us_won != null);
    const faceoffsWon = withFaceoffs.reduce((n, g) => n + (g.faceoffs_us_won ?? 0), 0);
    const faceoffsLost = withFaceoffs.reduce((n, g) => n + (g.faceoffs_us_lost ?? 0), 0);
    const withXg = filteredGames.filter((g) => g.team_xg_us != null);
    const xgFor = withXg.reduce((n, g) => n + (g.team_xg_us ?? 0), 0);
    const xgAgainst = withXg.reduce((n, g) => n + (g.team_xg_opponent ?? 0), 0);
    return {
      games: withShots.length,
      shotsFor,
      shotsAgainst,
      faceoffPct: faceoffsWon + faceoffsLost > 0 ? (faceoffsWon / (faceoffsWon + faceoffsLost)) * 100 : null,
      xgFor,
      xgAgainst,
      xgGames: withXg.length,
    };
  }, [filteredGames]);

  // ---- Carte de chaleur par joueur : tirs et mises au jeu, compilés sur les
  // matchs retenus par le filtre. Pas de coordonnées de tir sur le rapport
  // TPE (seulement des étiquettes posées sur un dessin) : la « chaleur » ici
  // vient de l'intensité de la couleur selon le total du joueur, pas d'une
  // position sur la patinoire. ----
  const playerHeat = useMemo(() => {
    const byPlayer = new Map<string, { shots: number; faceoffsWon: number; faceoffsLost: number; games: number }>();
    for (const a of filteredStats) {
      const cur = byPlayer.get(a.player_id) ?? { shots: 0, faceoffsWon: 0, faceoffsLost: 0, games: 0 };
      cur.shots += a.shots_on_goal ?? 0;
      cur.faceoffsWon += a.faceoffs_won ?? 0;
      cur.faceoffsLost += a.faceoffs_lost ?? 0;
      cur.games += 1;
      byPlayer.set(a.player_id, cur);
    }
    const rows: HeatRow[] = players
      .map((p) => {
        const t = byPlayer.get(p.id);
        if (!t) return null;
        return {
          player: p,
          shots: t.shots,
          faceoffsWon: t.faceoffsWon,
          faceoffPct: t.faceoffsWon + t.faceoffsLost > 0 ? (t.faceoffsWon / (t.faceoffsWon + t.faceoffsLost)) * 100 : null,
          games: t.games,
        };
      })
      .filter((r): r is HeatRow => r !== null);

    // Attaquants et défenseurs séparés : les mises au jeu ne concernent que
    // les premiers, et mélanger les deux postes dans un même classement de
    // tirs n'a jamais grand sens (les D tirent nettement moins).
    const forwards = rows.filter((r) => r.player.position === "F");
    const defense = rows.filter((r) => r.player.position === "D");
    const maxShots = (group: HeatRow[]) => Math.max(1, ...group.map((r) => r.shots));
    const maxFaceoffs = (group: HeatRow[]) => Math.max(1, ...group.map((r) => r.faceoffsWon));

    return {
      forwards,
      defense,
      maxShotsF: maxShots(forwards),
      maxFaceoffsF: maxFaceoffs(forwards),
      maxShotsD: maxShots(defense),
    };
  }, [filteredStats, players]);

  // ---- Carte de chaleur collective des mises au jeu — reproduit le
  // diagramme « Face-Offs by zones » du rapport, cumulé sur les matchs
  // retenus par le filtre. ----
  const zoneHeatmap = useMemo(() => {
    const grids = filteredGames.map((g) => g.faceoff_zone_map).filter((z): z is NonNullable<typeof z> => z !== null);
    if (grids.length === 0) return null;
    return { grid: sumFaceoffZoneGrids(grids), games: grids.length };
  }, [filteredGames]);

  const zoneTotal = useMemo(() => {
    if (!zoneHeatmap) return { won: 0, lost: 0 };
    return Object.values(zoneHeatmap.grid).reduce(
      (acc, l) => ({ won: acc.won + l.won, lost: acc.lost + l.lost }),
      { won: 0, lost: 0 }
    );
  }, [zoneHeatmap]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Statistiques avancées</h1>
        <p className="text-slate-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Statistiques avancées</h1>
        <p className="text-slate-500 text-sm">
          Compilées automatiquement depuis le rapport TPE téléversé après chaque match (fiche du match, dans Résultats).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_ORDER.map((c) => {
          const on = categories.has(c);
          return (
            <button
              key={c}
              onClick={() => toggleCategory(c)}
              aria-pressed={on}
              className={`rounded-full px-4 py-1.5 text-sm font-bold border transition-colors ${
                on
                  ? "bg-gold-500 border-gold-400 text-ink-900"
                  : "bg-white/5 border-white/15 text-slate-300 hover:border-gold-400/50"
              }`}
            >
              {CATEGORY_LABEL[c]}
            </button>
          );
        })}
      </div>

      {teamSummary.games === 0 ? (
        <p className="text-sm text-slate-400">Aucun rapport de statistiques avancées pour ce filtre.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="Tirs au but" value={`${teamSummary.shotsFor} - ${teamSummary.shotsAgainst}`} hint={`Nous - adversaire, sur ${teamSummary.games} match(s)`} />
            <StatCard label="Mises au jeu" value={teamSummary.faceoffPct === null ? "-" : `${teamSummary.faceoffPct.toFixed(1)} %`} hint="Gagnées" />
            {teamSummary.xgGames > 0 && (
              <StatCard label="xG d'équipe" value={`${teamSummary.xgFor.toFixed(1)} - ${teamSummary.xgAgainst.toFixed(1)}`} hint={`Nous - adversaire, sur ${teamSummary.xgGames} match(s)`} />
            )}
          </div>

          {/* Carte de chaleur par joueur — attaquants et défenseurs séparés :
              les mises au jeu ne concernent que les premiers. */}
          <section className="card space-y-2">
            <h2 className="font-semibold">Heat map — tirs et mises au jeu par joueur</h2>
            <p className="text-xs text-slate-500">
              Compilé sur les matchs cochés ci-dessus. La couleur suit l&apos;intensité du total de chaque joueur —
              clique une colonne pour trier.
            </p>

            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-gold-700 mb-1">Attaquants</h3>
              {playerHeat.forwards.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune donnée pour ce filtre.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <SortHeader label="Joueur" k="name" sort={sortF} onSort={(k) => toggleSort(sortF, setSortF, k)} className="py-1.5 pr-3" />
                        <SortHeader label="PJ" k="games" sort={sortF} onSort={(k) => toggleSort(sortF, setSortF, k)} className="py-1.5 px-3 text-center" />
                        <SortHeader label="Tirs au but" k="shots" sort={sortF} onSort={(k) => toggleSort(sortF, setSortF, k)} className="py-1.5 px-3 text-center" />
                        <SortHeader label="MAJ gagnées" k="faceoffsWon" sort={sortF} onSort={(k) => toggleSort(sortF, setSortF, k)} className="py-1.5 px-3 text-center" />
                        <SortHeader label="MAJ %" k="faceoffPct" sort={sortF} onSort={(k) => toggleSort(sortF, setSortF, k)} className="py-1.5 px-3 text-center" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortHeatRows(playerHeat.forwards, sortF).map(({ player, shots, faceoffsWon, faceoffPct, games }) => (
                        <tr key={player.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                            <Link href={`/joueurs/${player.id}`} className="hover:text-gold-700 hover:underline">
                              #{player.jersey_number ?? "?"} {lastName(player.full_name)}
                            </Link>
                          </td>
                          <td className="py-1.5 px-3 text-center text-slate-500">{games}</td>
                          <HeatCell value={shots} intensity={shots / playerHeat.maxShotsF} />
                          <HeatCell value={faceoffsWon} intensity={faceoffsWon / playerHeat.maxFaceoffsF} />
                          <td className="py-1.5 px-3 text-center text-slate-600">
                            {faceoffPct === null ? "-" : `${faceoffPct.toFixed(0)} %`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-gold-700 mb-1 mt-3">Défenseurs</h3>
              {playerHeat.defense.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune donnée pour ce filtre.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <SortHeader label="Joueur" k="name" sort={sortD} onSort={(k) => toggleSort(sortD, setSortD, k)} className="py-1.5 pr-3" />
                        <SortHeader label="PJ" k="games" sort={sortD} onSort={(k) => toggleSort(sortD, setSortD, k)} className="py-1.5 px-3 text-center" />
                        <SortHeader label="Tirs au but" k="shots" sort={sortD} onSort={(k) => toggleSort(sortD, setSortD, k)} className="py-1.5 px-3 text-center" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortHeatRows(playerHeat.defense, sortD).map(({ player, shots, games }) => (
                        <tr key={player.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                            <Link href={`/joueurs/${player.id}`} className="hover:text-gold-700 hover:underline">
                              #{player.jersey_number ?? "?"} {lastName(player.full_name)}
                            </Link>
                          </td>
                          <td className="py-1.5 px-3 text-center text-slate-500">{games}</td>
                          <HeatCell value={shots} intensity={shots / playerHeat.maxShotsD} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Carte de chaleur collective — reproduit le diagramme « Face-Offs
              by zones » du rapport, cumulé sur les matchs cochés ci-dessus. */}
          {zoneHeatmap && (
            <section className="card space-y-2">
              <h2 className="font-semibold">Heat map — mises au jeu par zone (équipe)</h2>
              <p className="text-xs text-slate-500">
                Cumulé sur {zoneHeatmap.games} match(s) avec rapport TPE. Bleu = au-dessus de 50 % de réussite, rouge
                = en dessous.
              </p>
              <div className="max-w-2xl mx-auto">
                <FaceoffZoneHeatmap grid={zoneHeatmap.grid} total={zoneTotal} />
              </div>
            </section>
          )}
        </>
      )}

      <div className="card space-y-2">
        <h2 className="font-semibold">TPE</h2>
        <p className="text-sm text-slate-600">Portail de statistiques avancées de l&apos;équipe.</p>
        <a href="https://portal.tpeteam.com/premium/team/9147" target="_blank" rel="noreferrer" className="btn-dark inline-flex w-fit">
          Ouvrir TPE →
        </a>
      </div>

      {/* Rapports PDF déjà téléversés, consultables directement d'ici. */}
      <section className="card space-y-2">
        <h2 className="font-semibold">📄 Rapports PDF (TPE)</h2>
        {reportDocs.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun rapport téléversé pour l&apos;instant — voir la fiche d&apos;un match dans Résultats.</p>
        ) : (
          <ul className="text-sm divide-y divide-slate-100">
            {reportDocs.map((d) => {
              const g = gamesById.get(d.game_id);
              const team = g ? findTeamByOpponent(g.opponent) : undefined;
              return (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2 min-w-0">
                    {team?.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={team.logo} alt={team.name} className="h-5 w-5 shrink-0 object-contain" />
                    )}
                    <span className="tabular-nums text-slate-500 shrink-0">{g?.game_date ?? "?"}</span>
                    <span className="truncate">{team?.name ?? g?.opponent ?? d.file_name}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <a href={d.file_url} target="_blank" rel="noreferrer" className="text-gold-700 hover:underline">
                      Ouvrir le PDF →
                    </a>
                    {g && (
                      <Link href={`/resultats/${g.id}`} className="text-slate-500 hover:underline">
                        Fiche du match
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link href="/statistiques-avancees/pre-scout" className="card hover:border-gold-400 transition-colors block">
        <h2 className="font-semibold mb-1">🔍 Pre-Scout</h2>
        <p className="text-sm text-slate-500">Les 20 équipes M17 AAA de la LHEQ, notes et fiches par adversaire.</p>
      </Link>
    </div>
  );
}
