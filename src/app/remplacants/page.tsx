"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Game, LineupUnit, Player } from "@/lib/types";

const emptyForm = { full_name: "", jersey_number: "", position: "F" as "F" | "D" | "G" };

/** Limite réglementaire de matchs de saison régulière par joueur affilié. */
const CALL_UP_LIMIT = 10;

const CATEGORY_SHORT: Record<string, string> = {
  hors_concours: "hors concours",
  series: "séries",
  tournoi: "tournoi",
  saison_reguliere: "saison",
};

export default function RemplacantsPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [units, setUnits] = useState<LineupUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const [{ data: pls }, { data: gms }, { data: allUnits }] = await Promise.all([
      supabase.from("players").select("*").order("jersey_number"),
      supabase.from("games").select("*").not("lineup_id", "is", null).order("game_date"),
      supabase.from("lineup_units").select("*"),
    ]);
    setPlayers(pls ?? []);
    setGames(gms ?? []);
    setUnits(allUnits ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addCallUp(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    await supabase.from("players").insert({
      full_name: form.full_name.trim(),
      jersey_number: form.jersey_number ? Number(form.jersey_number) : null,
      position: form.position,
      is_call_up: true,
    });
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  async function toggleActive(p: Player) {
    await supabase.from("players").update({ active: !p.active }).eq("id", p.id);
    load();
  }

  const callUps = players.filter((p) => p.is_call_up);

  const playersByLineup = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const u of units) {
      const set = map.get(u.lineup_id) ?? new Set<string>();
      u.player_ids.forEach((id) => set.add(id));
      map.set(u.lineup_id, set);
    }
    return map;
  }, [units]);

  /**
   * Un remplaçant est limité à 10 matchs de SAISON RÉGULIÈRE. Les hors
   * concours, séries, tournois et provinciaux ne comptent pas dans ce total :
   * ils sont affichés à part pour garder l'historique complet.
   */
  const tally = useMemo(() => {
    return callUps.map((p) => {
      const dressed = games.filter((g) => g.lineup_id && playersByLineup.get(g.lineup_id)?.has(p.id));
      return {
        player: p,
        games: dressed.filter((g) => g.category === "saison_reguliere"),
        otherGames: dressed.filter((g) => g.category !== "saison_reguliere"),
      };
    });
  }, [callUps, games, playersByLineup]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Remplaçants</h1>
          <p className="text-slate-500 text-sm">
            Joueurs rappelés ponctuellement. Limite de {CALL_UP_LIMIT} matchs de saison régulière par joueur —
            les hors concours, séries, tournois et provinciaux ne comptent pas dans ce total.
          </p>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Annuler" : "+ Ajouter un remplaçant"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addCallUp} className="card flex flex-wrap gap-2 items-end">
          <div>
            <label className="label">Nom</label>
            <input
              required
              className="input"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="w-24">
            <label className="label">#</label>
            <input
              type="number"
              className="input"
              value={form.jersey_number}
              onChange={(e) => setForm({ ...form, jersey_number: e.target.value })}
            />
          </div>
          <div className="w-28">
            <label className="label">Position</label>
            <select
              className="input"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value as "F" | "D" | "G" })}
            >
              <option value="F">Attaquant</option>
              <option value="D">Défenseur</option>
              <option value="G">Gardien</option>
            </select>
          </div>
          <button className="btn" type="submit">
            Ajouter
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : callUps.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun remplaçant enregistré. Ajoute-en un ci-dessus — il apparaîtra ensuite dans le banc de
          l'alignement rapide, avec un badge « R ».
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">Joueur</th>
                <th className="py-2 pr-4">Position</th>
                <th className="py-2 pr-4">Saison régulière</th>
                <th className="py-2 pr-4">Détail</th>
                <th className="py-2 pr-4">Actif au banc</th>
              </tr>
            </thead>
            <tbody>
              {tally.map(({ player, games: playedGames, otherGames }) => (
                <tr key={player.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-4 font-medium">
                    {player.jersey_number ? `#${player.jersey_number} ` : ""}
                    {player.full_name}
                  </td>
                  <td className="py-2 pr-4">{player.position ?? "-"}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`badge ${
                        playedGames.length >= CALL_UP_LIMIT
                          ? "bg-red-100 text-red-800"
                          : playedGames.length >= CALL_UP_LIMIT - 2
                            ? "bg-amber-100 text-amber-800"
                            : "bg-gold-100 text-ink-800"
                      }`}
                    >
                      {playedGames.length} / {CALL_UP_LIMIT}
                    </span>
                    {otherGames.length > 0 && (
                      <span className="block text-[11px] text-slate-400 mt-0.5">
                        + {otherGames.length} hors saison régulière
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">
                    {playedGames.length === 0
                      ? "-"
                      : playedGames.map((g) => `${g.game_date} vs ${g.opponent}`).join(", ")}
                    {otherGames.length > 0 && (
                      <span className="block text-[11px] italic mt-0.5">
                        Ne comptent pas : {otherGames.map((g) => `${g.game_date} (${CATEGORY_SHORT[g.category]})`).join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => toggleActive(player)}
                      className={`badge ${player.active ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-500"}`}
                    >
                      {player.active ? "Oui" : "Non"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
