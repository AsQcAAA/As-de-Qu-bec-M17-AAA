"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OPPONENT_TEAMS, findTeamByOpponent } from "@/lib/lheqTeams";
import { RESULT_COLOR, RESULT_LABEL } from "@/lib/gameResults";
import type { Game, GameEvent, ScoutNote } from "@/lib/types";

const emptyForm = { wins: "", losses: "", otl_losses: "", last5: "", notes: "" };

function stripAccents(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Les noms d'adversaire saisis manuellement dans les matchs ne correspondent
// pas toujours mot pour mot au nom officiel LHEQ — on matche par mot-clé
// significatif (ex: "Blizzard") plutôt que par égalité stricte.
function matchesOpponent(opponent: string, teamName: string): boolean {
  const opponentNorm = stripAccents(opponent);
  const words = stripAccents(teamName)
    .split(/[\s/.-]+/)
    .filter((w) => w.length >= 4);
  return words.some((w) => opponentNorm.includes(w));
}

export default function PreScoutTeamPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: teamSlug } = use(params);
  const team = OPPONENT_TEAMS.find((t) => t.slug === teamSlug);
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<Game[]>([]);
  // Pointeurs de cette équipe contre nous, compilés depuis les feuilles de match.
  const [theirScorers, setTheirScorers] = useState<
    { name: string; jersey: number | null; goals: number; assists: number; points: number }[]
  >([]);

  useEffect(() => {
    if (!team) return;
    const teamName = team.name;
    async function load() {
      const [{ data }, { data: allGames }, { data: events }] = await Promise.all([
        supabase.from("scout_notes").select("*").eq("team_slug", teamSlug).maybeSingle(),
        supabase.from("games").select("*").order("game_date", { ascending: false }),
        supabase.from("game_events").select("*").eq("side", "opponent").eq("event_type", "goal"),
      ]);
      const note = data as ScoutNote | null;
      if (note) {
        setForm({
          wins: note.wins?.toString() ?? "",
          losses: note.losses?.toString() ?? "",
          otl_losses: note.otl_losses?.toString() ?? "",
          last5: note.last5 ?? "",
          notes: note.notes ?? "",
        });
        setUpdatedAt(note.updated_at);
      }
      setHistory((allGames ?? []).filter((g) => matchesOpponent(g.opponent, teamName)).slice(0, 3));
      // On ne garde que les buts marqués contre NOUS par cette équipe : un même
      // évènement adverse appartient au match, donc au bon adversaire.
      // Les matchs hors concours sont écartés : un pointeur adverse vu en
      // préparation ne dit rien de sa production réelle contre nous.
      const ourGamesVsThem = new Set(
        (allGames ?? [])
          .filter((g) => findTeamByOpponent(g.opponent)?.slug === teamSlug && g.category !== "hors_concours")
          .map((g) => g.id)
      );
      const tally = new Map<string, { name: string; jersey: number | null; goals: number; assists: number }>();
      const bump = (name: string | null, jersey: number | null, kind: "goals" | "assists") => {
        if (!name) return;
        const cur = tally.get(name) ?? { name, jersey, goals: 0, assists: 0 };
        cur[kind] += 1;
        if (cur.jersey == null) cur.jersey = jersey;
        tally.set(name, cur);
      };
      for (const e of (events ?? []) as GameEvent[]) {
        if (!ourGamesVsThem.has(e.game_id)) continue;
        bump(e.player_name, e.jersey_number, "goals");
        bump(e.assist1_name, e.assist1_jersey, "assists");
        bump(e.assist2_name, e.assist2_jersey, "assists");
      }
      setTheirScorers(
        [...tally.values()]
          .map((t) => ({ ...t, points: t.goals + t.assists }))
          .sort((a, b) => b.points - a.points || b.goals - a.goals)
      );

      setLoading(false);
    }
    load();
  }, [teamSlug]);

  if (!team) return notFound();

  async function save() {
    setSaving(true);
    await supabase.from("scout_notes").upsert(
      {
        team_slug: teamSlug,
        wins: form.wins ? Number(form.wins) : null,
        losses: form.losses ? Number(form.losses) : null,
        otl_losses: form.otl_losses ? Number(form.otl_losses) : null,
        last5: form.last5 || null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_slug" }
    );
    setUpdatedAt(new Date().toISOString());
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <Link href="/statistiques-avancees/pre-scout" className="text-sm text-ink-800 hover:text-gold-700 font-medium hover:underline">
        ← Pre-Scout
      </Link>

      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={team.logo} alt={team.name} className="h-16 w-16 object-contain" />
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-slate-500 text-sm">M17 AAA — LHEQ</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={team.lheqUrl} target="_blank" rel="noreferrer" className="btn-dark">
          Cahier d'équipe LHEQ →
        </a>
        {team.tpeTeamId ? (
          <a
            href={`https://portal.tpeteam.com/premium/team/${team.tpeTeamId}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            Fiche TPE →
          </a>
        ) : (
          <span className="btn-secondary opacity-50 cursor-not-allowed" title="Cette équipe n'est pas suivie par TPE">
            Fiche TPE (non disponible)
          </span>
        )}
      </div>

      {!loading && history.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Historique face à cette équipe (3 derniers affrontements)</h2>
          <div className="space-y-1.5">
            {history.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-1.5">
                <span>
                  {g.game_date} — {g.is_home ? "Domicile" : "Visiteur"}
                </span>
                <span className="flex items-center gap-2">
                  {g.result && <span className={`badge ${RESULT_COLOR[g.result]}`}>{RESULT_LABEL[g.result]}</span>}
                  <span className="text-slate-500">
                    {g.goals_for ?? "-"}–{g.goals_against ?? "-"}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Fiche : {history.filter((g) => g.result === "W").length}V —{" "}
            {history.filter((g) => g.result && g.result !== "W").length}D sur les {history.length} derniers.
          </p>
        </section>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <section className="card space-y-3">
            <h2 className="font-semibold">Fiche globale</h2>
            <p className="text-xs text-slate-500">
              Saisie manuelle en attendant le début de la saison (aucune API publique LHEQ) — tu pourras
              recopier ces chiffres depuis leur Cahier d'équipe ou la page Statistiques LHEQ.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Victoires</label>
                <input
                  type="number"
                  className="input"
                  value={form.wins}
                  onChange={(e) => setForm({ ...form, wins: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Défaites</label>
                <input
                  type="number"
                  className="input"
                  value={form.losses}
                  onChange={(e) => setForm({ ...form, losses: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Déf. (prol.)</label>
                <input
                  type="number"
                  className="input"
                  value={form.otl_losses}
                  onChange={(e) => setForm({ ...form, otl_losses: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">5 derniers matchs (ex: V-V-D-V-DP)</label>
              <input
                className="input"
                value={form.last5}
                onChange={(e) => setForm({ ...form, last5: e.target.value })}
              />
            </div>
          </section>

          {/* Leurs pointeurs contre NOUS — compilé depuis les feuilles de match,
              donc limité aux parties qu'on a réellement jouées contre eux. */}
          <section className="card space-y-3">
            <h2 className="font-semibold">Leurs pointeurs contre nous</h2>
            {theirScorers.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucun but enregistré contre nous. Les pointeurs adverses apparaissent après le téléversement
                d&apos;une feuille de match.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 pr-4 w-12">#</th>
                      <th className="py-2 pr-4">Joueur</th>
                      <th className="py-2 pr-4 w-14">B</th>
                      <th className="py-2 pr-4 w-14">P</th>
                      <th className="py-2 pr-4 w-14">PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {theirScorers.map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-bold">{p.jersey ?? "-"}</td>
                        <td className="py-2 pr-4">{p.name}</td>
                        <td className="py-2 pr-4">{p.goals}</td>
                        <td className="py-2 pr-4">{p.assists}</td>
                        <td className="py-2 pr-4 font-bold">{p.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Notes de pre-scout</h2>
            <textarea
              className="input"
              rows={10}
              placeholder="Style de jeu, joueurs clés, tendances offensives/défensives..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </section>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn" onClick={save} disabled={saving || loading}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {updatedAt && <span className="text-xs text-slate-400">Mis à jour le {updatedAt.slice(0, 10)}</span>}
      </div>
    </div>
  );
}
