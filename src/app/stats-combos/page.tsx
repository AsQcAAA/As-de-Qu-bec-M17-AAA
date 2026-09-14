"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { matchupLabel } from "@/lib/gameResults";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { lastName } from "@/lib/players";
import type { Game, GameCategory, GameEvent, Player } from "@/lib/types";

const CATEGORY_LABEL: Record<GameCategory, string> = {
  hors_concours: "Hors concours",
  saison_reguliere: "Saison régulière",
  series: "Séries",
  tournoi: "Tournoi",
};
const CATEGORY_ORDER: GameCategory[] = ["saison_reguliere", "series", "tournoi", "hors_concours"];

/**
 * Types de combinaison.
 *
 * Sur la feuille de match, les aides sont inscrites de gauche à droite : la
 * PREMIÈRE est la passe décisive (primary assist), celle qui précède
 * directement le but. « Primary » ne retient donc que les duos marqueur +
 * première aide, les plus révélateurs d'une vraie connexion offensive.
 */
type ComboFilter = "all" | "primary" | "goal_pairs" | "trios";

const FILTER_LABEL: Record<ComboFilter, string> = {
  all: "Tous les types",
  primary: "Passe décisive (marqueur + 1re aide)",
  goal_pairs: "Duos sur un but (toutes aides)",
  trios: "Trios complets (marqueur + 2 aides)",
};

/**
 * Une combinaison conserve le RÔLE de chacun : « Lachapelle de Gosselin » n'est
 * pas la même chose que « Gosselin de Lachapelle ». Le marqueur est donc gardé
 * à part des passeurs, et la clé de regroupement respecte cet ordre.
 * scorerId vaut null pour une paire de passeurs sur un même but.
 */
interface ComboRow {
  key: string;
  scorerId: string | null;
  assistIds: string[];
  goals: number;
}

export default function StatsCombosPage() {
  const supabase = createClient();
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [gameId, setGameId] = useState<string>("");
  const [filter, setFilter] = useState<ComboFilter>("all");
  const [categories, setCategories] = useState<Set<GameCategory>>(new Set(["saison_reguliere"]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: gs }, { data: pls }, { data: ev }] = await Promise.all([
        supabase.from("games").select("*").not("result", "is", null).order("game_date", { ascending: false }),
        supabase.from("players").select("*"),
        supabase.from("game_events").select("*").eq("side", "us").eq("event_type", "goal"),
      ]);
      setGames(gs ?? []);
      setPlayers(pls ?? []);
      setEvents(ev ?? []);
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

  // Le menu des matchs ne propose que les types cochés.
  const visibleGames = useMemo(() => games.filter((g) => categories.has(g.category)), [games, categories]);

  // Si le match choisi n'appartient plus aux types cochés, on retombe sur
  // « Tous les matchs » — calculé au rendu plutôt que via un effet, qui
  // provoquerait un rendu en cascade.
  const picked = games.find((g) => g.id === gameId);
  const selectedGame = picked && categories.has(picked.category) ? picked : undefined;
  const effectiveGameId = selectedGame?.id ?? "";

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.full_name])), [players]);

  /**
   * Chaque but produit une ou plusieurs combinaisons, selon le filtre.
   * On n'additionne que des joueurs rattachés à une fiche : un nom adverse ou
   * non reconnu ne peut pas former de combinaison fiable.
   */
  const combos = useMemo(() => {
    const allowed = new Set(games.filter((g) => categories.has(g.category)).map((g) => g.id));
    const scoped = effectiveGameId
      ? events.filter((e) => e.game_id === effectiveGameId)
      : events.filter((e) => allowed.has(e.game_id));
    const tally = new Map<string, ComboRow>();

    /** Enregistre une combinaison marqueur → passeurs (ou une paire de passeurs). */
    const add = (scorerId: string | null, assistIds: (string | null)[]) => {
      const assists = assistIds.filter((x): x is string => !!x);
      if ((scorerId ? 1 : 0) + assists.length < 2) return;
      const key = `${scorerId ?? ""}>${assists.join(",")}`;
      const row = tally.get(key) ?? { key, scorerId, assistIds: assists, goals: 0 };
      row.goals += 1;
      tally.set(key, row);
    };

    for (const e of scoped) {
      const scorer = e.player_id;
      const a1 = e.assist1_player_id;
      const a2 = e.assist2_player_id;
      if (filter === "primary") {
        add(scorer, [a1]);
      } else if (filter === "trios") {
        if (scorer && a1 && a2) add(scorer, [a1, a2]);
      } else if (filter === "goal_pairs") {
        add(scorer, [a1]);
        add(scorer, [a2]);
        // Deux passeurs sur le même but : aucun n'a marqué.
        if (a1 && a2) add(null, [a1, a2]);
      } else {
        add(scorer, [a1]);
        add(scorer, [a2]);
        if (a1 && a2) add(null, [a1, a2]);
        if (scorer && a1 && a2) add(scorer, [a1, a2]);
      }
    }

    return [...tally.values()].sort((a, b) => b.goals - a.goals);
  }, [events, effectiveGameId, filter, nameById, games, categories]);


  /** Nom de famille cliquable vers la fiche du joueur. */
  function PlayerLink({ id }: { id: string }) {
    return (
      <button
        onClick={() => router.push(`/joueurs/${id}`)}
        className="font-medium text-ink-800 hover:text-gold-700 hover:underline"
      >
        {lastName(nameById.get(id) ?? "?")}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Combinaisons les plus efficaces</h1>
        <p className="text-slate-400 text-sm">
          Compilé automatiquement à partir des buts inscrits sur les feuilles de match : quels joueurs
          produisent ensemble.
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

      <div className="card grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Match</label>
          <select className="input" value={effectiveGameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="">Tous les matchs</option>
            {visibleGames.map((g) => (
              <option key={g.id} value={g.id}>
                {g.game_date} — {matchupLabel(g, findTeamByOpponent(g.opponent)?.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type de combinaison</label>
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as ComboFilter)}>
            {(Object.keys(FILTER_LABEL) as ComboFilter[]).map((k) => (
              <option key={k} value={k}>
                {FILTER_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : combos.length === 0 ? (
        <p className="text-sm text-slate-400">
          Aucune combinaison{selectedGame ? " pour ce match" : ""}. Les combinaisons apparaissent après le
          téléversement d&apos;une feuille de match.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4 w-10"></th>
                <th className="py-2 pr-4">Combinaison</th>
                <th className="py-2 pr-4 w-24">Joueurs</th>
                <th className="py-2 pr-4 w-24">Buts</th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c, i) => (
                <tr key={c.key} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-slate-400 font-medium">{i + 1}</td>
                  <td className="py-2 pr-4">
                    {/* Formulation du hockey : « Lachapelle de Gosselin et Desrochers ».
                        Sans marqueur, ce sont deux passeurs sur un même but. */}
                    {c.scorerId ? (
                      <>
                        <PlayerLink id={c.scorerId} />
                        {c.assistIds.length > 0 && <span className="text-slate-500"> de </span>}
                        {c.assistIds.map((id, idx) => (
                          <span key={id}>
                            {idx > 0 && <span className="text-slate-500"> et </span>}
                            <PlayerLink id={id} />
                          </span>
                        ))}
                      </>
                    ) : (
                      <>
                        {c.assistIds.map((id, idx) => (
                          <span key={id}>
                            {idx > 0 && <span className="text-slate-500"> et </span>}
                            <PlayerLink id={id} />
                          </span>
                        ))}
                        <span className="text-slate-500 text-xs"> (deux aides)</span>
                      </>
                    )}
                  </td>
                  <td className="py-2 pr-4">{(c.scorerId ? 1 : 0) + c.assistIds.length}</td>
                  <td className="py-2 pr-4 font-bold">{c.goals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Se lit « marqueur de passeur » : « Lachapelle de Gosselin » signifie un but de Lachapelle sur une
        passe de Gosselin. Sur une feuille de match, les aides sont inscrites de gauche à droite — la première
        est la passe décisive, seule retenue par le filtre du même nom.
      </p>
    </div>
  );
}
