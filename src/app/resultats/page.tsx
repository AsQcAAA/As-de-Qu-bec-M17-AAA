"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { RESULT_COLOR, RESULT_LABEL } from "@/lib/gameResults";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import type { Game, GameCategory, GameResult, ScheduleEvent } from "@/lib/types";

const CATEGORY_LABEL: Record<GameCategory, string> = {
  hors_concours: "Hors concours",
  saison_reguliere: "Saison régulière",
  series: "Séries",
  tournoi: "Tournoi",
};
const CATEGORY_ORDER: GameCategory[] = ["saison_reguliere", "series", "tournoi", "hors_concours"];

// Anciens matchs préparatoires placeholder — seuls ceux-là ont un bouton de
// suppression (matchs d'avant le début officiel de la saison).
const REMOVABLE_DATES = new Set(["2026-08-19", "2026-08-20", "2026-08-21", "2026-08-23"]);

const emptyForm = {
  game_date: "",
  opponent: "",
  location: "",
  is_home: true,
  category: "saison_reguliere" as GameCategory,
  result: "W" as GameResult,
  goals_for: 0,
  goals_against: 0,
  external_link: "",
  notes: "",
};

export default function ResultatsPage() {
  const supabase = createClient();
  const [games, setGames] = useState<Game[]>([]);
  const [gameEvents, setGameEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<GameCategory | "all">("saison_reguliere");

  async function load() {
    const [{ data: gms }, { data: evts }] = await Promise.all([
      supabase.from("games").select("*").order("game_date", { ascending: true }),
      supabase.from("schedule_events").select("*").eq("event_type", "game"),
    ]);
    setGames(gms ?? []);
    setGameEvents(evts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const timeByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of gameEvents) {
      if (e.start_time && !map.has(e.event_date)) map.set(e.event_date, e.start_time);
    }
    return map;
  }, [gameEvents]);

  async function updateBusTime(id: string, time: string) {
    await supabase.from("games").update({ bus_departure_time: time || null }).eq("id", id);
    load();
  }

  async function removeGame(id: string) {
    await supabase.from("games").delete().eq("id", id);
    load();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("games").insert({
      game_date: form.game_date,
      opponent: form.opponent,
      location: form.location || null,
      is_home: form.is_home,
      category: form.category,
      result: form.result,
      goals_for: form.goals_for,
      goals_against: form.goals_against,
      external_link: form.external_link || null,
      notes: form.notes || null,
    });
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  const filteredGames = categoryFilter === "all" ? games : games.filter((g) => g.category === categoryFilter);

  const record = filteredGames.reduce(
    (acc, g) => {
      if (g.result === "W") acc.w++;
      else if (g.result) acc.l++;
      return acc;
    },
    { w: 0, l: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Résultats</h1>
          <p className="text-slate-500 text-sm">
            Fiche : {record.w} victoires — {record.l} défaites sur {filteredGames.length} matchs
            {categoryFilter !== "all" ? ` (${CATEGORY_LABEL[categoryFilter]})` : ""}.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            className="input w-auto"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as GameCategory | "all")}
          >
            <option value="all">Tous les types</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <a
            href="https://masculin.lheq.ca/fr/schedule-stats-standings"
            target="_blank"
            rel="noreferrer"
            className="btn-dark"
          >
            📊 Statistiques LHEQ →
          </a>
          <button className="btn" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Annuler" : "+ Ajouter un match"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              required
              className="input"
              value={form.game_date}
              onChange={(e) => setForm({ ...form, game_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Adversaire</label>
            <input
              required
              className="input"
              value={form.opponent}
              onChange={(e) => setForm({ ...form, opponent: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Lieu</label>
            <input
              className="input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Domicile / Visiteur</label>
            <select
              className="input"
              value={form.is_home ? "home" : "away"}
              onChange={(e) => setForm({ ...form, is_home: e.target.value === "home" })}
            >
              <option value="home">Domicile</option>
              <option value="away">Visiteur</option>
            </select>
          </div>
          <div>
            <label className="label">Type de match</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as GameCategory })}
            >
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Résultat</label>
            <select
              className="input"
              value={form.result}
              onChange={(e) => setForm({ ...form, result: e.target.value as GameResult })}
            >
              {Object.entries(RESULT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Buts pour</label>
              <input
                type="number"
                className="input"
                value={form.goals_for}
                onChange={(e) => setForm({ ...form, goals_for: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Buts contre</label>
              <input
                type="number"
                className="input"
                value={form.goals_against}
                onChange={(e) => setForm({ ...form, goals_against: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Lien vers le site des résultats (ligue, stats, etc.)</label>
            <input
              type="url"
              placeholder="https://..."
              className="input"
              value={form.external_link}
              onChange={(e) => setForm({ ...form, external_link: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn">
              Enregistrer le match
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : filteredGames.length === 0 ? (
        <p className="text-slate-500">Aucun match enregistré pour ce type.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Heure</th>
                <th className="py-2 pr-4">Adversaire</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Domicile/Visiteur</th>
                <th className="py-2 pr-4">Aréna</th>
                <th className="py-2 pr-4">🚌 Départ Duberger</th>
                <th className="py-2 pr-4">Résultat</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Lien</th>
                <th className="py-2 pr-4">Match</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredGames.map((g) => {
                const played = !!g.result;
                const time = timeByDate.get(g.game_date);
                return (
                  <tr
                    key={g.id}
                    className={`border-b last:border-0 ${g.category === "hors_concours" ? "bg-slate-100 text-slate-500" : ""}`}
                  >
                    <td className="py-2 pr-4">{g.game_date}</td>
                    <td className="py-2 pr-4">{!played && time ? time.slice(0, 5) : "-"}</td>
                    <td className="py-2 pr-4">{findTeamByOpponent(g.opponent)?.name ?? g.opponent}</td>
                    <td className="py-2 pr-4">
                      {g.category === "hors_concours" ? (
                        <span className="badge bg-slate-200 text-slate-500">{CATEGORY_LABEL[g.category]}</span>
                      ) : g.category !== "saison_reguliere" ? (
                        <span className="badge bg-slate-200 text-slate-700">{CATEGORY_LABEL[g.category]}</span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 pr-4">{g.is_home ? "Domicile" : "Visiteur"}</td>
                    {/* L'aréna vient de l'horaire officiel de la ligue : en
                        lecture seule pour éviter une modification accidentelle. */}
                    <td className="py-2 pr-4">{g.location ?? "-"}</td>
                    <td className="py-2 pr-4">
                      {!g.is_home && ["albatros", "espoirs-sag-lsj"].includes(findTeamByOpponent(g.opponent)?.slug ?? "") ? (
                        <input
                          type="time"
                          className="input py-1 w-24"
                          defaultValue={g.bus_departure_time?.slice(0, 5) ?? ""}
                          onBlur={(e) => {
                            if (e.target.value !== (g.bus_departure_time?.slice(0, 5) ?? "")) updateBusTime(g.id, e.target.value);
                          }}
                        />
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {g.result && <span className={`badge ${RESULT_COLOR[g.result]}`}>{RESULT_LABEL[g.result]}</span>}
                    </td>
                    <td className="py-2 pr-4">
                      {g.goals_for ?? "-"} – {g.goals_against ?? "-"}
                    </td>
                    <td className="py-2 pr-4">
                      {g.external_link ? (
                        <a
                          href={g.external_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-ink-800 hover:text-gold-700 font-medium hover:underline"
                        >
                          Voir →
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/resultats/${g.id}`} className="text-ink-800 hover:text-gold-700 font-medium hover:underline">
                        Détails / feuille de match →
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      {REMOVABLE_DATES.has(g.game_date) && (
                        <button onClick={() => removeGame(g.id)} className="text-xs text-red-600 hover:underline">
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
