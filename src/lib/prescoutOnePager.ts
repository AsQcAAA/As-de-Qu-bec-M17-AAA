import type { SupabaseClient } from "@supabase/supabase-js";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { LHEQ_M17_AAA_TEAMS, findTeamByOpponent, type LheqTeam } from "./lheqTeams";
import { OPPONENT_ROSTERS } from "./opponentRosters";
import { titleCase } from "./players";
import { TEAM_STATS, TEAM_STATS_UPDATED, type TeamStats } from "./leagueTeamStats";
import { LEAGUE_GOALIES, LEAGUE_SCORERS, type GoalieLine, type ScorerLine } from "./leagueLeaders";
import { secondsToToi } from "./tpeReport";
import type { FormationValue } from "@/components/FormationMap";
import type { Game, GameEvent } from "./types";

/**
 * One pager de pre-scout envoyé aux coachs la veille d'un match : tout ce que
 * la page pre-scout de l'adversaire sait, ramené à une feuille.
 * Si l'alignement attendu n'a pas été saisi, on reprend l'alignement adverse
 * du dernier match joué contre eux.
 */

export type Slot = { n: string; name: string };
export type Slots = Record<string, Slot>;

export interface LineupPlayer {
  pos: string;
  n: string;
  name: string;
  /** Saison (classement de la ligue) : « 11 PJ · 4-3 = 7 » */
  season: string | null;
  /** Contre nous : temps de glace moyen et points */
  toiVsUs: string | null;
  ptsVsUs: number;
}

export interface OnePagerData {
  title: string;
  game: Game;
  team: LheqTeam;
  when: string;
  where: string;
  stats: TeamStats | null;
  usStats: TeamStats | null;
  statsUpdated: string;
  last5: string | null;
  /** Leurs 5 derniers matchs de la ligue, du plus récent au plus ancien. */
  last5Games: { date: string; side: "vs" | "@"; opponent: string; logo: string | null; result: string }[];
  history: { date: string; label: string }[];
  lineupSource: "attendu" | "dernier match" | null;
  lineupDate: string | null;
  forwards: LineupPlayer[][];
  defense: LineupPlayer[][];
  goalies: LineupPlayer[];
  scorers: ScorerLine[];
  leagueGoalies: GoalieLine[];
  theirScorersVsUs: { name: string; n: number | null; g: number; a: number }[];
  notes: { label: string; text: string }[];
  /** Dispositions PP / PK déjà dessinées dans le pre-scout (glace + joueurs + flèches). */
  maps: { label: string; kind: MapKind; value: FormationValue }[];
  /** Nom de famille par numéro (effectif de l'adversaire), pour les dispositions. */
  rosterLastNames: Record<string, string>;
}

export type MapKind = "pp" | "pk" | "bo" | "fo" | "pkbo" | "pkfo";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

export async function buildOnePagerData(supabase: SupabaseClient, gameId: string): Promise<OnePagerData | null> {
  const { data: game } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
  if (!game) return null;
  const team = findTeamByOpponent(game.opponent);
  if (!team) return null;
  const slug = team.slug;

  const [{ data: note }, { data: allGames }, { data: evts }, { data: lg }, { data: sched }] = await Promise.all([
    supabase.from("scout_notes").select("*").eq("team_slug", slug).maybeSingle(),
    supabase.from("games").select("*").order("game_date"),
    supabase.from("game_events").select("*").eq("side", "opponent").eq("event_type", "goal"),
    supabase.from("league_games").select("*").or(`home.eq.${slug},away.eq.${slug}`).order("game_date"),
    supabase.from("schedule_events").select("start_time, title").eq("event_date", game.game_date).eq("event_type", "game"),
  ]);

  // Nos matchs contre eux (hors matchs préparatoires), déjà joués.
  const vsThem = ((allGames ?? []) as Game[]).filter(
    (g) => findTeamByOpponent(g.opponent)?.slug === slug && g.category !== "hors_concours"
  );
  const played = vsThem.filter((g) => g.result != null && g.id !== game.id);
  const history = played.map((g) => ({
    date: format(parseISO(g.game_date), "d MMM", { locale: fr }),
    label: `${g.result === "W" ? "V" : g.result === "L" ? "D" : g.result === "OTL" ? "DP" : g.result ?? ""} ${g.goals_for ?? "?"}-${g.goals_against ?? "?"}${g.category === "tournoi" ? " (tournoi)" : ""}`,
  }));

  // Alignement : attendu, sinon celui du dernier match contre eux.
  let slots: Slots = (note?.lineup as Slots | null) ?? {};
  let lineupSource: OnePagerData["lineupSource"] = Object.values(slots).some((s) => s?.n) ? "attendu" : null;
  let lineupDate: string | null = null;
  if (!lineupSource && played.length > 0) {
    const ids = played.map((g) => g.id);
    const { data: gls } = await supabase.from("game_opponent_lineups").select("game_id, slots").in("game_id", ids);
    const byGame = new Map((gls ?? []).map((r) => [r.game_id as string, r.slots as Slots]));
    for (const g of [...played].reverse()) {
      const s = byGame.get(g.id);
      if (s && Object.values(s).some((x) => x?.n)) {
        slots = s;
        lineupSource = "dernier match";
        lineupDate = format(parseISO(g.game_date), "d MMMM", { locale: fr });
        break;
      }
    }
  }

  // Temps de glace et points contre nous, par numéro.
  const playedIds = played.map((g) => g.id);
  const { data: opp } = playedIds.length
    ? await supabase.from("opponent_player_game_stats").select("jersey, toi_seconds").in("game_id", playedIds)
    : { data: [] as { jersey: number; toi_seconds: number | null }[] };
  const toi = new Map<number, number[]>();
  for (const r of opp ?? []) if (r.toi_seconds) toi.set(r.jersey, [...(toi.get(r.jersey) ?? []), r.toi_seconds]);

  const ptsByJersey = new Map<number, { g: number; a: number; name: string | null }>();
  const ourIds = new Set(played.map((g) => g.id));
  const bump = (n: number | null, name: string | null, k: "g" | "a") => {
    if (n == null) return;
    const cur = ptsByJersey.get(n) ?? { g: 0, a: 0, name };
    cur[k] += 1;
    cur.name ??= name;
    ptsByJersey.set(n, cur);
  };
  for (const e of (evts ?? []) as GameEvent[]) {
    if (!ourIds.has(e.game_id)) continue;
    bump(e.jersey_number, e.player_name, "g");
    bump(e.assist1_jersey, e.assist1_name, "a");
    bump(e.assist2_jersey, e.assist2_name, "a");
  }

  const roster = (OPPONENT_ROSTERS[slug] ?? {}) as Record<string, string>;
  const scorers = LEAGUE_SCORERS[slug] ?? [];
  const player = (key: string, pos: string): LineupPlayer | null => {
    const s = slots[key];
    if (!s?.n) return null;
    const name = titleCase(s.name || roster[s.n.trim()] || "");
    const sc = name ? scorers.find((x) => norm(x.name) === norm(name)) : undefined;
    const t = toi.get(Number(s.n));
    const p = ptsByJersey.get(Number(s.n));
    return {
      pos,
      n: s.n,
      name: name || "—",
      season: sc ? `${sc.gp} PJ · ${sc.g}-${sc.a} = ${sc.g + sc.a}` : null,
      toiVsUs: t ? secondsToToi(Math.round(t.reduce((a, b) => a + b, 0) / t.length)) : null,
      ptsVsUs: p ? p.g + p.a : 0,
    };
  };
  const forwards = [1, 2, 3, 4]
    .map((l) => (["AG", "C", "AD"] as const).map((p) => player(`F${l}-${p}`, p)).filter((x): x is LineupPlayer => !!x))
    .filter((r) => r.length > 0);
  const defense = [1, 2, 3, 4]
    .map((l) => (["DG", "DD"] as const).map((p) => player(`D${l}-${p}`, l === 4 ? "D7" : p)).filter((x): x is LineupPlayer => !!x))
    .filter((r) => r.length > 0);
  const goalies = ["G1", "G2"].map((k) => player(k, "G")).filter((x): x is LineupPlayer => !!x);

  // 5 derniers matchs de la ligue (calendrier importé le lundi).
  const done = (lg ?? []).filter((g) => g.home_score != null && g.away_score != null).slice(-5);
  const last5 = done.length
    ? [...done]
        .reverse()
        .map((g) => {
          const mine = g.home === slug ? g.home_score : g.away_score;
          const theirs = g.home === slug ? g.away_score : g.home_score;
          return mine > theirs ? "V" : "D";
        })
        .join("-")
    : null;

  const teamOf = (sl: string) => LHEQ_M17_AAA_TEAMS.find((t) => t.slug === sl);
  const last5Games = [...done].reverse().map((g) => {
    const home = g.home === slug;
    const mine = home ? g.home_score : g.away_score;
    const theirs = home ? g.away_score : g.home_score;
    const opp = home ? g.away : g.home;
    return {
      date: format(parseISO(g.game_date), "d MMM", { locale: fr }),
      side: (home ? "vs" : "@") as "vs" | "@",
      opponent: teamOf(opp)?.name ?? opp,
      logo: teamOf(opp)?.logo ?? null,
      result: `${mine > theirs ? "V" : "D"} ${mine}-${theirs}`,
    };
  });

  const theirScorersVsUs = [...ptsByJersey.entries()]
    .map(([n, v]) => ({ n, name: titleCase(roster[String(n)] ?? v.name ?? `N° ${n}`), g: v.g, a: v.a }))
    .sort((a, b) => b.g + b.a - (a.g + a.a) || b.g - a.g)
    .slice(0, 6);

  // Une disposition est « dessinée » dès qu'elle a un numéro, une flèche ou une note :
  // les ronds vides placés d'office par la page ne comptent pas.
  const drawn = (m: FormationValue | null | undefined): m is FormationValue =>
    !!m && (m.markers.some((x) => x.number) || (m.arrows?.length ?? 0) > 0 || !!m.note?.trim());
  const candidates: { label: string; kind: MapKind; value: FormationValue | null | undefined }[] = [
    { label: "PP 1", kind: "pp", value: note?.pp_map },
    { label: "PP 2", kind: "pp", value: note?.pp2_map },
    { label: "PP BO", kind: "bo", value: note?.ppbo_map },
    { label: "PP BO 2", kind: "bo", value: note?.ppbo2_map },
    { label: "PP FO", kind: "fo", value: note?.fo_map },
    { label: "PK", kind: "pk", value: note?.pk_map },
    { label: "PK FC", kind: "pkbo", value: note?.pkbo_map },
    { label: "PK FO", kind: "pkfo", value: note?.pkfo_map },
  ];
  const maps = candidates.filter((c) => drawn(c.value)).map((c) => ({ label: c.label, kind: c.kind, value: c.value as FormationValue }));
  const notes = [{ label: "Notes", text: (note?.notes ?? "").trim() }].filter((x) => x.text);
  const rosterLastNames = Object.fromEntries(
    Object.entries(roster).map(([n, full]) => [n, titleCase(full).split(/\s+/).slice(-1)[0] ?? ""])
  );

  const time = (sched?.[0]?.start_time as string | undefined)?.slice(0, 5).replace(":", "h") ?? null;
  const day = format(parseISO(game.game_date), "EEEE d MMMM yyyy", { locale: fr });
  const title = `Pre-scout - ${team.name} - ${day}`;

  return {
    title,
    game: game as Game,
    team,
    when: `${day.charAt(0).toUpperCase()}${day.slice(1)}${time ? ` · ${time}` : ""}`,
    where: `${game.is_home ? "Domicile" : "Extérieur"}${game.location ? ` · ${game.location}` : ""}`,
    stats: TEAM_STATS[slug] ?? null,
    usStats: TEAM_STATS["as-de-quebec"] ?? null,
    statsUpdated: TEAM_STATS_UPDATED,
    last5,
    last5Games,
    history,
    lineupSource,
    lineupDate,
    forwards,
    defense,
    goalies,
    scorers: [...scorers].sort((a, b) => b.g + b.a - (a.g + a.a) || b.g - a.g).slice(0, 8),
    leagueGoalies: [...(LEAGUE_GOALIES[slug] ?? [])].sort((a, b) => b.gp - a.gp),
    theirScorersVsUs,
    notes,
    maps,
    rosterLastNames,
  };
}
