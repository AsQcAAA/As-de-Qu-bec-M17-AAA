"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OPPONENT_TEAMS, findTeamByOpponent } from "@/lib/lheqTeams";
import { RESULT_COLOR, RESULT_LABEL, matchupLabel } from "@/lib/gameResults";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import FormationMap, { emptyFormation, type FormationValue } from "@/components/FormationMap";
import { SECOND_YEAR_PLAYERS, isSecondYear } from "@/lib/secondYearPlayers";
import { OPPONENT_ROSTERS, jerseyOf } from "@/lib/opponentRosters";
import { titleCase } from "@/lib/players";
import { LEAGUE_GOALIES, LEAGUE_SCORERS, LEADERS_UPDATED } from "@/lib/leagueLeaders";
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
  const [ppMap, setPpMap] = useState<FormationValue>(() => emptyFormation("pp"));
  const [pkMap, setPkMap] = useState<FormationValue>(() => emptyFormation("pk"));
  const [pp2Map, setPp2Map] = useState<FormationValue>(() => emptyFormation("pp"));
  const [ppBoMap, setPpBoMap] = useState<FormationValue>(() => emptyFormation("bo"));
  const [foMap, setFoMap] = useState<FormationValue>(() => emptyFormation("fo"));
  /** Onglet affiché dans la carte PP : 0 = PP1, 1 = PP2, 2 = PP BO, 3 = FO. */
  const [ppWave, setPpWave] = useState(0);
  const mapTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /** Enregistre une disposition (PP ou PK) peu après le dernier geste. */
  function saveMap(kind: "pp" | "pp2" | "ppbo" | "fo" | "pk", value: FormationValue) {
    ({ pp: setPpMap, pp2: setPp2Map, ppbo: setPpBoMap, fo: setFoMap, pk: setPkMap })[kind](value);
    clearTimeout(mapTimers.current[kind]);
    mapTimers.current[kind] = setTimeout(() => {
      supabase
        .from("scout_notes")
        .upsert({ team_slug: teamSlug, [`${kind}_map`]: value }, { onConflict: "team_slug" })
        .then(() => {});
    }, 500);
  }
  /** Matchs de la ligue de cette équipe (calendrier importé chaque lundi). */
  const [leagueGames, setLeagueGames] = useState<
    { game_date: string; home: string; away: string; home_score: number | null; away_score: number | null }[]
  >([]);
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
      const { data: lg } = await supabase
        .from("league_games")
        .select("*")
        .or(`home.eq.${teamSlug},away.eq.${teamSlug}`)
        .order("game_date", { ascending: true });
      setLeagueGames(lg ?? []);
      const note = data as ScoutNote | null;
      setPpMap(note?.pp_map ?? emptyFormation("pp"));
      setPkMap(note?.pk_map ?? emptyFormation("pk"));
      setPp2Map(note?.pp2_map ?? emptyFormation("pp"));
      setPpBoMap(note?.ppbo_map ?? emptyFormation("bo"));
      setFoMap(note?.fo_map ?? emptyFormation("fo"));
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
      // Un même joueur adverse peut être écrit de deux façons (casse, accents,
      // nom absent de la feuille) : on le reconnaît par son numéro quand il y
      // en a un, sinon par son nom normalisé, et on retrouve le nom manquant
      // dans l'effectif enregistré de l'équipe.
      const tally = new Map<string, { name: string; jersey: number | null; goals: number; assists: number }>();
      const bump = (name: string | null, jersey: number | null, kind: "goals" | "assists") => {
        if (!name && jersey == null) return;
        const rosterName = jersey != null ? OPPONENT_ROSTERS[teamSlug]?.[String(jersey)] ?? null : null;
        const display = titleCase(name ?? rosterName ?? `N° ${jersey}`);
        const key = jersey != null ? `#${jersey}` : stripAccents(display).replace(/[^a-z]/g, "");
        const cur = tally.get(key) ?? { name: display, jersey, goals: 0, assists: 0 };
        cur[kind] += 1;
        if (cur.jersey == null) cur.jersey = jersey;
        tally.set(key, cur);
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
                  stats.push({ label: "Désavantage numérique", value: `${g.pk_kills ?? 0}/${g.pk_opportunities}` });
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
                    <th className="py-1.5 pr-4 w-12">#</th>
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
                        <td className="py-1.5 pr-4 font-bold">{jerseyOf(teamSlug, p.name) ?? "-"}</td>
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

      {!loading && (
        <div className="grid md:grid-cols-2 gap-6">
          <section className="card space-y-2">
            <h2 className="font-semibold">Meilleurs pointeurs</h2>
            {(LEAGUE_SCORERS[teamSlug] ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Aucun joueur de cette équipe dans le haut du classement des pointeurs.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1.5 pr-3 w-10">#</th>
                    <th className="py-1.5 pr-3">Joueur</th>
                    <th className="py-1.5 pr-3 w-10">MJ</th>
                    <th className="py-1.5 pr-3 w-10">B</th>
                    <th className="py-1.5 pr-3 w-10">A</th>
                    <th className="py-1.5 w-12">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {LEAGUE_SCORERS[teamSlug]
                    .slice()
                    .sort((a, b) => b.g + b.a - (a.g + a.a) || b.g - a.g)
                    .map((p) => (
                      <tr key={p.name} className="border-b last:border-0">
                        <td className="py-1.5 pr-3 font-bold">{jerseyOf(teamSlug, p.name) ?? "-"}</td>
                        <td className="py-1.5 pr-3">
                          {p.name}
                          {isSecondYear(teamSlug, p.name) && (
                            <span className="ml-2 badge bg-gold-100 text-gold-800">2e année</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3">{p.gp}</td>
                        <td className="py-1.5 pr-3">{p.g}</td>
                        <td className="py-1.5 pr-3">{p.a}</td>
                        <td className="py-1.5 font-bold">{p.g + p.a}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-slate-500">Classement de la ligue au {LEADERS_UPDATED} — seuls les joueurs du haut du classement sont listés.</p>
          </section>

          <section className="card space-y-2">
            <h2 className="font-semibold">Gardiens</h2>
            {(LEAGUE_GOALIES[teamSlug] ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">Aucun gardien de cette équipe dans le classement.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1.5 pr-3 w-10">#</th>
                    <th className="py-1.5 pr-3">Gardien</th>
                    <th className="py-1.5 pr-3 w-10">MJ</th>
                    <th className="py-1.5 pr-3 w-10">V</th>
                    <th className="py-1.5 pr-3 w-10">D</th>
                    <th className="py-1.5 pr-3 w-10">DP</th>
                    <th className="py-1.5 w-14">MOY</th>
                  </tr>
                </thead>
                <tbody>
                  {LEAGUE_GOALIES[teamSlug].slice().sort((a, b) => b.gp - a.gp).map((g) => (
                    <tr key={g.name} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 font-bold">{jerseyOf(teamSlug, g.name) ?? "-"}</td>
                      <td className="py-1.5 pr-3">
                        {g.name}
                        {isSecondYear(teamSlug, g.name) && (
                          <span className="ml-2 badge bg-gold-100 text-gold-800">2e année</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">{g.gp}</td>
                      <td className="py-1.5 pr-3">{g.w ?? "-"}</td>
                      <td className="py-1.5 pr-3">{g.l ?? "-"}</td>
                      <td className="py-1.5 pr-3">{g.otl ?? "-"}</td>
                      <td className="py-1.5 font-bold">{g.gaa.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-slate-500">Classement des gardiens de la ligue au {LEADERS_UPDATED}.</p>
          </section>
        </div>
      )}

      {!loading && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-bold">Dispositions spéciales</h2>
            <p className="text-slate-400 text-sm">
              Glisse les numéros pour reproduire la formation de {team.name}. Touche un joueur pour changer son numéro ;
              tout s&apos;enregistre automatiquement.
            </p>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            {(() => {
              const w = ppWave;
              const cfg = [
                { kind: "pp" as const, key: "pp" as const, value: ppMap, title: "⚡ Avantage numérique (PP1)", sub: `Comment ${team.name} se dispose quand elle a l'avantage — zone offensive, but en haut.` },
                { kind: "pp" as const, key: "pp2" as const, value: pp2Map, title: "⚡ Avantage numérique (PP2)", sub: `Deuxième vague de ${team.name} — zone offensive, but en haut.` },
                { kind: "bo" as const, key: "ppbo" as const, value: ppBoMap, title: "🚀 Sortie de zone en avantage (PP BO)", sub: `Sortie de zone de ${team.name} en avantage numérique — glace complète, leur zone à gauche.` },
                { kind: "fo" as const, key: "fo" as const, value: foMap, title: "🔵 Mise au jeu (FO)", sub: `Formation de ${team.name} sur une mise au jeu — zone offensive, but en haut.` },
              ][w];
              return (
                <div className={w === 2 ? "lg:col-span-2" : ""}>
                  <FormationMap
                    key={cfg.key}
                    kind={cfg.kind}
                    title={cfg.title}
                    subtitle={cfg.sub}
                    value={cfg.value}
                    onChange={(v) => saveMap(cfg.key, v)}
                    waveLabels={["PP1", "PP2", "PP BO", "FO"]}
                    wave={w}
                    onWave={setPpWave}
                  />
                </div>
              );
            })()}
            <FormationMap
              kind="pk"
              title="🛡️ Désavantage numérique (PK)"
              subtitle={`Comment ${team.name} se dispose en infériorité — zone défensive, but en haut.`}
              value={pkMap}
              onChange={(v) => saveMap("pk", v)}
            />
          </div>
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
              Mise à jour automatique chaque lundi, à partir du calendrier de la ligue (PDF).
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Victoires", form.wins],
                ["Défaites", form.losses],
                ["Déf. (prol.)", form.otl_losses],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="text-xl font-black">{value || "—"}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">5 derniers matchs</div>
              <div className="text-lg font-black font-mono">{form.last5 || "—"}</div>
            </div>
            {(() => {
              const played = leagueGames.filter(
                (g) => g.home_score != null && g.away_score != null && !(g.home_score === 0 && g.away_score === 0)
              );
              const last = played.slice(-5).reverse();
              if (last.length === 0) return null;
              const nameOf = (slug: string) => OPPONENT_TEAMS.find((t) => t.slug === slug)?.name ?? (slug === "as-de-quebec" ? "As de Québec" : slug);
              return (
                <div className="space-y-1">
                  {last.map((g) => {
                    const isHome = g.home === teamSlug;
                    const own = isHome ? g.home_score! : g.away_score!;
                    const other = isHome ? g.away_score! : g.home_score!;
                    const opp = isHome ? g.away : g.home;
                    const tag = own > other ? "V" : own < other ? "D" : "N";
                    return (
                      <div key={`${g.game_date}-${g.home}-${g.away}`} className="flex items-center gap-2 text-sm border-b last:border-0 pb-1">
                        <span
                          className={`w-6 text-center rounded font-black text-xs py-0.5 ${
                            tag === "V" ? "bg-green-100 text-green-800" : tag === "D" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {tag}
                        </span>
                        <span className="text-slate-500 w-24 shrink-0 capitalize">
                          {format(parseISO(g.game_date), "EEE d MMM", { locale: fr })}
                        </span>
                        <span className="flex-1 min-w-0 truncate">
                          {isHome ? "vs" : "@"} {nameOf(opp)}
                        </span>
                        <span className="font-black">
                          {own}–{other}
                        </span>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-slate-400">Un pointage nul correspond à un match décidé en fusillade.</p>
                </div>
              );
            })()}
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
