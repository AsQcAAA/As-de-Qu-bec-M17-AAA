"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OPPONENT_TEAMS, findTeamByOpponent } from "@/lib/lheqTeams";
import { RESULT_COLOR, RESULT_LABEL, matchupLabel } from "@/lib/gameResults";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { SECOND_YEAR_PLAYERS, isSecondYear } from "@/lib/secondYearPlayers";
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
  /** Dernier match réellement joué contre cette équipe. */
  const [lastGame, setLastGame] = useState<Game | null>(null);
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
      // Dernier match joué : résultat connu, ou date passée (allGames est trié du plus récent au plus ancien).
      const todayKey = format(new Date(), "yyyy-MM-dd");
      setLastGame(
        (allGames ?? []).find(
          (g) =>
            (findTeamByOpponent(g.opponent)?.slug === teamSlug || matchesOpponent(g.opponent, teamName)) &&
            (g.result != null || g.game_date < todayKey)
        ) ?? null
      );
      setHistory((allGames ?? []).filter((g) => findTeamByOpponent(g.opponent)?.slug === teamSlug || matchesOpponent(g.opponent, teamName)).sort((a, b) => a.game_date.localeCompare(b.game_date)));
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

      {!loading && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Dernier match face à cette équipe</h2>
          {lastGame ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{matchupLabel(lastGame, team.name)}</div>
                  <div className="text-sm text-slate-500 capitalize">
                    {format(parseISO(lastGame.game_date), "EEEE d MMMM yyyy", { locale: fr })}
                    {lastGame.location ? ` — ${lastGame.location}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {lastGame.result && <span className={`badge ${RESULT_COLOR[lastGame.result]}`}>{RESULT_LABEL[lastGame.result]}</span>}
                  <span className="text-2xl font-black">
                    {lastGame.goals_for ?? "-"}–{lastGame.goals_against ?? "-"}
                  </span>
                </div>
              </div>
              {(() => {
                const g = lastGame;
                const stats: { label: string; value: string }[] = [];
                if (g.shots_on_goal_us != null || g.shots_on_goal_opponent != null)
                  stats.push({ label: "Tirs au but", value: `${g.shots_on_goal_us ?? "-"} – ${g.shots_on_goal_opponent ?? "-"}` });
                if (g.pp_opportunities != null)
                  stats.push({ label: "Avantage numérique", value: `${g.pp_goals ?? 0}/${g.pp_opportunities}` });
                if (g.pk_opportunities != null)
                  stats.push({ label: "Désavantage numérique", value: `${g.pk_kills ?? 0}/${g.pk_opportunities} contrés` });
                if (g.faceoffs_us_won != null && g.faceoffs_us_lost != null) {
                  const t = g.faceoffs_us_won + g.faceoffs_us_lost;
                  stats.push({ label: "Mises au jeu", value: t ? `${Math.round((g.faceoffs_us_won / t) * 100)} %` : "-" });
                }
                if (g.team_xg_us != null || g.team_xg_opponent != null)
                  stats.push({
                    label: "xG",
                    value: `${g.team_xg_us?.toFixed(2) ?? "-"} – ${g.team_xg_opponent?.toFixed(2) ?? "-"}`,
                  });
                return stats.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {stats.map((st) => (
                      <div key={st.label} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{st.label}</div>
                        <div className="font-black">{st.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              <Link href={`/resultats/${lastGame.id}`} className="btn-dark inline-block">
                Voir le sommaire du match →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aucun match joué contre cette équipe pour l&apos;instant.</p>
          )}
        </section>
      )}

      {!loading && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Joueurs de 2e année</h2>
          {(SECOND_YEAR_PLAYERS[teamSlug] ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Aucun joueur de 2e année dans cette équipe.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1.5 pr-4">Joueur</th>
                    <th className="py-1.5 pr-4 w-14">MJ</th>
                    <th className="py-1.5 pr-4 w-14">B</th>
                    <th className="py-1.5 pr-4 w-14">A</th>
                    <th className="py-1.5 pr-4 w-14">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {SECOND_YEAR_PLAYERS[teamSlug]
                    .slice()
                    .sort((a, b) => (a.goalie ? 1 : 0) - (b.goalie ? 1 : 0) || (b.g ?? 0) + (b.a ?? 0) - ((a.g ?? 0) + (a.a ?? 0)))
                    .map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-1.5 pr-4">
                          {p.goalie && <span className="mr-1.5 rounded bg-ink-800 text-white text-[10px] font-black px-1">G</span>}
                          {p.name}
                          {p.note && <span className="text-xs text-slate-500"> ({p.note})</span>}
                        </td>
                        <td className="py-1.5 pr-4">{p.gp}</td>
                        {p.goalie ? (
                          <td className="py-1.5 pr-4 font-semibold" colSpan={3}>
                            Fiche {p.record} · Moy. {p.gaa?.toFixed(2)}
                          </td>
                        ) : (
                          <>
                            <td className="py-1.5 pr-4">{p.g}</td>
                            <td className="py-1.5 pr-4">{p.a}</td>
                            <td className="py-1.5 pr-4 font-bold">{(p.g ?? 0) + (p.a ?? 0)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">Statistiques de la saison 2025-26 (LHEQ, saison régulière).</p>
        </section>
      )}

      {!loading && history.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Tous les affrontements ({history.length})</h2>
          <div className="space-y-1.5">
            {history.map((g) => {
              const played = g.result != null;
              return (
                <Link
                  key={g.id}
                  href={`/resultats/${g.id}`}
                  className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-1.5 hover:text-gold-700"
                >
                  <span className="capitalize">
                    {format(parseISO(g.game_date), "EEE d MMM yyyy", { locale: fr })} — {g.is_home ? "Domicile" : "Visiteur"}
                    {g.location ? ` (${g.location})` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    {played ? (
                      <>
                        <span className={`badge ${RESULT_COLOR[g.result!]}`}>{RESULT_LABEL[g.result!]}</span>
                        <span className="font-bold">
                          {g.goals_for ?? "-"}–{g.goals_against ?? "-"}
                        </span>
                      </>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-600">À venir</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            Fiche : {history.filter((g) => g.result === "W").length}V —{" "}
            {history.filter((g) => g.result && g.result !== "W").length}D en {history.filter((g) => g.result).length} match(s) joué(s).
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
                        <td className="py-2 pr-4">
                          {p.name}
                          {isSecondYear(teamSlug, p.name) && (
                            <span className="ml-2 badge bg-gold-100 text-gold-800" title="Joueur de 2e année">2e année</span>
                          )}
                        </td>
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
