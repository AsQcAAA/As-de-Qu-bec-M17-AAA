"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import JerseyDisplay from "@/components/JerseyDisplay";
import { lastName } from "@/lib/players";
import type { Game, LineupUnit, Player, UnitType } from "@/lib/types";
import { matchupLabel } from "@/lib/gameResults";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { byAnnounceOrder, type RosterGrid } from "@/lib/lineupPositions";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  forward_line: "Trio d'attaquants",
  defense_pair: "Paire de défenseurs",
  powerplay: "Avantage numérique",
  penalty_kill: "Désavantage numérique",
};

const ROSTER_TEMPLATE: {
  label: string;
  slots: number;
  color: "gold" | "gris";
  gridCols: string;
  category: "F" | "D" | "G";
  icon: string;
  short: string;
}[] = [
  { label: "Attaquants (effectif)", slots: 10, color: "gold", gridCols: "grid-cols-3", category: "F", icon: "🏒", short: "Attaquants" },
  { label: "Défenseurs (effectif)", slots: 7, color: "gris", gridCols: "grid-cols-2", category: "D", icon: "🛡️", short: "Défenseurs" },
  { label: "Gardiens (effectif)", slots: 2, color: "gris", gridCols: "grid-cols-1", category: "G", icon: "🥅", short: "Gardiens" },
];

const GROUPING: Record<"F" | "D", { unitType: UnitType; prefix: string }> = {
  F: { unitType: "forward_line", prefix: "Trio" },
  D: { unitType: "defense_pair", prefix: "Duo" },
};

// Page en lecture seule : on ne fait que retracer l'alignement utilisé une
// journée donnée. Toute modification se fait uniquement depuis la fiche du
// jour (clique sur une journée de pratique ou de match).
export default function AlignementsPage() {
  const supabase = createClient();
  const [date, setDate] = useState(todayStr());
  const [players, setPlayers] = useState<Player[]>([]);
  const [units, setUnits] = useState<LineupUnit[]>([]);
  // Deux listes de dates : celles où l'équipe a joué, celles où elle s'est
  // entraînée. On ne propose que les journées ayant un alignement enregistré.
  const [gameOptions, setGameOptions] = useState<{ date: string; label: string }[]>([]);
  const [practiceOptions, setPracticeOptions] = useState<{ date: string; label: string }[]>([]);
  const [hasLineup, setHasLineup] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(d: string) {
    setLoading(true);
    const [{ data: pls }, { data: lineups }, { data: gm }] = await Promise.all([
      supabase.from("players").select("*"),
      supabase.from("lineups").select("*").eq("lineup_date", d).limit(1),
      supabase.from("games").select("*").eq("game_date", d).maybeSingle(),
    ]);
    setPlayers(pls ?? []);
    setGame(gm ?? null);
    const l = lineups?.[0] ?? null;
    setHasLineup(!!l);
    if (l) {
      const { data: u } = await supabase.from("lineup_units").select("*").eq("lineup_id", l.id).order("unit_order");
      setUnits(u ?? []);
    } else {
      setUnits([]);
    }
    setLoading(false);
  }

  // Construit les deux listes déroulantes : seules les journées possédant un
  // alignement enregistré y figurent, sinon on proposerait des pages vides.
  useEffect(() => {
    async function loadOptions() {
      const [{ data: lineups }, { data: games }, { data: events }] = await Promise.all([
        supabase.from("lineups").select("lineup_date"),
        supabase.from("games").select("game_date, opponent, is_home").order("game_date"),
        supabase.from("schedule_events").select("event_date, event_type").eq("event_type", "practice"),
      ]);
      const withLineup = new Set((lineups ?? []).map((l) => l.lineup_date));
      const gameByDate = new Map((games ?? []).map((g) => [g.game_date, g as Game]));

      setGameOptions(
        (games ?? [])
          .filter((g) => withLineup.has(g.game_date))
          .map((g) => ({
            date: g.game_date,
            label: `${g.game_date} — ${matchupLabel(g as Game, findTeamByOpponent(g.opponent)?.name)}`,
          }))
      );

      const practiceDates = [...new Set((events ?? []).map((e) => e.event_date))]
        .filter((d) => withLineup.has(d) && !gameByDate.has(d))
        .sort();
      setPracticeOptions(practiceDates.map((d) => ({ date: d, label: `${d} — Pratique` })));
    }
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const byId = new Map(players.map((p) => [p.id, p]));
  const STARTERS_LABEL = "Partants (match)";
  // Le cinq partant est stocké comme une unité d'alignement, mais ce n'est pas
  // une combinaison : sans cette exclusion il s'affichait comme « Trio d'attaquants ».
  const starters = units.find((u) => u.unit_label === STARTERS_LABEL) ?? null;
  const starterIds = new Set(starters?.player_ids ?? []);
  const opponentTeam = game ? findTeamByOpponent(game.opponent) : undefined;
  // Les partants sont annoncés dans l'ordre AG, C, AD, DG, DD, G — le même
  // qu'à l'écran d'alignement et sur la feuille imprimée.
  const rosterGrids: RosterGrid[] = ROSTER_TEMPLATE.map((t) => ({
    position: t.category,
    playerIds: units.find((u) => u.unit_label === t.label)?.player_ids ?? [],
  }));
  const orderedStarters = (starters?.player_ids ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p)
    .sort(byAnnounceOrder(rosterGrids));
  const combos = units.filter(
    (u) => !u.unit_label.endsWith("(effectif)") && u.unit_label !== STARTERS_LABEL
  );

  function playerGroupColor(playerId: string, category: "F" | "D" | "G"): "gris" | "jaune" | null {
    if (category === "G") return null;
    const { unitType, prefix } = GROUPING[category];
    const combo = units.find(
      (u) => u.unit_type === unitType && u.unit_label.startsWith(`${prefix} `) && u.player_ids.includes(playerId)
    );
    return (combo?.color_group as "gris" | "jaune" | undefined) ?? null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alignements</h1>
          <p className="text-slate-300 text-sm">Retrace l'alignement utilisé une journée donnée (lecture seule).</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto"
            value={gameOptions.some((o) => o.date === date) ? date : ""}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          >
            <option value="">— Alignement de match —</option>
            {gameOptions.map((o) => (
              <option key={o.date} value={o.date}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="input w-auto"
            value={practiceOptions.some((o) => o.date === date) ? date : ""}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          >
            <option value="">— Alignement de pratique —</option>
            {practiceOptions.map((o) => (
              <option key={o.date} value={o.date}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="label mb-0 !text-slate-100">Date</label>
          <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : !hasLineup ? (
        <div className="card space-y-2">
          <p className="text-sm text-slate-500">Aucun alignement enregistré pour cette date.</p>
          <Link href={`/jour/${date}`} className="btn inline-flex">
            Aller à la journée du {date} →
          </Link>
        </div>
      ) : (
        <>
          {/* Même présentation que l'écran de construction : un panneau par
              position, compteur, photos et étoiles de partants. */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-white drop-shadow">
              Effectif du {date}
              {game && <span className="text-slate-300 font-normal"> — {matchupLabel(game, opponentTeam?.name)}</span>}
            </h2>
            <Link href={`/jour/${date}`} className="text-sm text-gold-400 hover:text-gold-300 font-medium hover:underline">
              Modifier depuis la journée →
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1fr)]">
            {ROSTER_TEMPLATE.map((t) => {
              const u = units.find((x) => x.unit_label === t.label);
              const ids = Array.from({ length: t.slots }, (_, i) => u?.player_ids[i] ?? "");
              const lastUsed = ids.reduce((last, id, i) => (id ? i : last), -1);
              const shown = ids.slice(0, Math.max(lastUsed + 1, 0));
              const filled = shown.filter(Boolean).length;
              return (
                <section
                  key={t.label}
                  className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur-sm overflow-hidden"
                >
                  <header className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gold-400">
                      <span aria-hidden>{t.icon}</span>
                      {t.short}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums bg-white/10 text-slate-300">
                      {filled}
                    </span>
                  </header>
                  <div className={`grid ${t.gridCols} gap-x-3 gap-y-6 p-4 pt-5 justify-items-center`}>
                    {shown.map((id, i) => {
                      const p = id ? byId.get(id) ?? null : null;
                      return (
                        <JerseyDisplay
                          key={i}
                          player={p}
                          color={t.color}
                          expectedPosition={t.category}
                          starting={!!id && starterIds.has(id)}
                          ring={
                            game
                              ? game.is_home
                                ? "local"
                                : "visiteur"
                              : id
                                ? playerGroupColor(id, t.category)
                                : null
                          }
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {starters && starters.player_ids.length > 0 && (
            <section className="rounded-2xl border border-gold-400/30 bg-black/60 backdrop-blur-sm overflow-hidden">
              <header className="border-b border-gold-400/25 bg-gold-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-gold-400">
                ★ Alignement partant du {date}
              </header>
              <div className="p-3 flex flex-wrap gap-2">
                {orderedStarters.map((p) => {
                  return (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2 py-1.5">
                      {p.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo_url}
                          alt={p.full_name}
                          className="h-8 w-8 shrink-0 rounded-full border border-white/30 object-cover"
                        />
                      ) : (
                        <span className="h-8 w-8 shrink-0 rounded-full bg-ink-900 text-gold-400 text-xs font-black flex items-center justify-center">
                          {p.jersey_number ?? "–"}
                        </span>
                      )}
                      <span className="text-xs font-black text-white">
                        #{p.jersey_number ?? "–"} {lastName(p.full_name)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {combos.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold">Combinaisons du {date}</h2>
              {combos.map((u) => (
                <div key={u.id} className="card">
                  <div className="badge bg-gold-100 text-ink-800 mb-1">{UNIT_TYPE_LABEL[u.unit_type]}</div>
                  <div className="font-medium">{u.unit_label}</div>
                  <div className="text-sm text-slate-500">
                    {u.player_ids.map((id) => (byId.get(id) ? lastName(byId.get(id)!.full_name) : "?")).join(", ")}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
