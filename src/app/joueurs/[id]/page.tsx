"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import PhysioConsultations from "@/components/PhysioConsultations";
import { ABSENCE_REASON_LABEL, EXCUSED_REASONS, REASON_EMOJI } from "@/lib/absenceReasons";
import { format } from "date-fns";
import { OFFICIAL_CATEGORIES, buildRosterByDate, gamesPlayedFor, goalieTotals, recordLabel, skaterTotals } from "@/lib/playerStats";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { parsePenaltyCode } from "@/lib/penalties";
import { averageToi, formatNet, secondsToToi, shootingPct } from "@/lib/tpeReport";
import { EVENT_TYPE_LABEL } from "@/lib/eventTypes";
import { formatHeight } from "@/lib/height";
import { useCoachDirectory } from "@/lib/useCoach";
import type { Absence, EventType, Game, GameCategory, GameEvent, Meeting, Player, PlayerGameAdvancedStat, PlayerGameStat, PlayerTestResult } from "@/lib/types";

/** Date + logo de l'adversaire — le logo se repère plus vite qu'une abréviation. */
function GameCell({ game }: { game: Game }) {
  const team = findTeamByOpponent(game.opponent);
  return (
    <span className="flex items-center gap-2">
      <span className="tabular-nums text-slate-600">{game.game_date}</span>
      <span className="text-slate-400">{game.is_home ? "vs" : "@"}</span>
      {team ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo} alt={team.name} title={team.name} className="h-6 w-6 object-contain shrink-0" />
      ) : (
        <span className="font-medium">{game.opponent}</span>
      )}
    </span>
  );
}

/** Une statistique compacte affichée dans l'en-tête de la fiche. */
function Stat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`font-black leading-none ${highlight ? "text-2xl text-gold-600" : "text-2xl text-slate-800"}`}>
        {value}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

const POSITION_LABEL: Record<string, string> = { F: "Attaquant", D: "Défenseur", G: "Gardien" };

const emptyMeetingForm = { meeting_date: format(new Date(), "yyyy-MM-dd"), topic: "", notes: "" };

const emptyTestForm = {
  test_name: "",
  value: "",
  unit: "",
  higher_is_better: "true",
  test_date: format(new Date(), "yyyy-MM-dd"),
  notes: "",
};

export default function JoueurDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const supabase = createClient();
  const { myId, isHeadCoach, authorLabel } = useCoachDirectory();

  const [player, setPlayer] = useState<Player | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [gameStats, setGameStats] = useState<PlayerGameStat[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);

  const [vsOpponent, setVsOpponent] = useState("");
  const [showAllGames, setShowAllGames] = useState(false);
  // Filtre de type de match appliqué aux totaux de la fiche.
  const [statFilter, setStatFilter] = useState<GameCategory | "all">("all");
  const [penalties, setPenalties] = useState<GameEvent[]>([]);
  const [rosterByDate, setRosterByDate] = useState<Map<string, Set<string>>>(new Map());
  const [teamGoals, setTeamGoals] = useState<GameEvent[]>([]);
  /** date → activités de la journée, pour nommer ce qui a été manqué. */
  const [activityByDate, setActivityByDate] = useState<Map<string, string>>(new Map());
  /** Rapport TPE de chaque match — source du temps de jeu, tirs, xG et +/-. */
  const [advancedStats, setAdvancedStats] = useState<PlayerGameAdvancedStat[]>([]);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  /** Types de blessure saisis dans l'onglet Blessures, par date de début d'épisode. */
  const [injuryNotes, setInjuryNotes] = useState<{ start_date: string; injury_type: string }[]>([]);

  const [meetingForm, setMeetingForm] = useState(emptyMeetingForm);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [editMeetingDraft, setEditMeetingDraft] = useState(emptyMeetingForm);

  const [testResults, setTestResults] = useState<PlayerTestResult[]>([]);
  const [testForm, setTestForm] = useState(emptyTestForm);
  const [showTestForm, setShowTestForm] = useState(false);

  const [objectives, setObjectives] = useState({ objective_1: "", objective_2: "", objective_3: "" });
  const [savingObjectives, setSavingObjectives] = useState(false);
  const [objectivesSavedAt, setObjectivesSavedAt] = useState<Date | null>(null);
  const [objectivesError, setObjectivesError] = useState<string | null>(null);
  // Une fois fixés avec le joueur, les objectifs ne doivent plus bouger au
  // premier clic malencontreux : ils se verrouillent après l'enregistrement,
  // et il faut un « Modifier » explicite pour les rouvrir.
  const [editingObjectives, setEditingObjectives] = useState(false);

  /**
   * Type de blessure applicable à une date : celui de l'épisode le plus récent
   * commencé au plus tard ce jour-là. Les notes sont triées du plus récent au
   * plus ancien, le premier qui précède la date est donc le bon.
   */
  function injuryTypeOn(date: string) {
    return injuryNotes.find((n) => n.start_date <= date)?.injury_type ?? null;
  }

  /**
   * Types de match retenus par le filtre.
   *
   * « Tous les matchs » veut dire tous les matchs OFFICIELS : le hors concours
   * ne compte pas dans les statistiques d'un joueur et ne s'affiche qu'en le
   * choisissant explicitement.
   */
  const activeCategories: GameCategory[] = statFilter === "all" ? OFFICIAL_CATEGORIES : [statFilter];
  const inFilter = (category: GameCategory | undefined) => !!category && activeCategories.includes(category);

  async function load() {
    const [{ data: p }, { data: pls }, { data: mts }, { data: abs }, { data: pgs }, { data: gms }, { data: tests }, { data: pens }, { data: lus }, { data: lunits }, { data: goals }, { data: sched }, { data: inotes }, { data: adv }] = await Promise.all([
      supabase.from("players").select("*").eq("id", id).maybeSingle(),
      supabase.from("players").select("*"),
      supabase.from("meetings").select("*").eq("player_id", id).eq("meeting_type", "individual").order("meeting_date", { ascending: false }),
      supabase.from("absences").select("*").eq("player_id", id).order("absence_date", { ascending: false }),
      supabase.from("player_game_stats").select("*").eq("player_id", id),
      supabase.from("games").select("*").order("game_date", { ascending: false }),
      supabase.from("player_test_results").select("*").eq("player_id", id).order("test_date", { ascending: false }),
      supabase.from("game_events").select("*").eq("player_id", id).eq("event_type", "penalty"),
      supabase.from("lineups").select("id, lineup_date"),
      supabase.from("lineup_units").select("lineup_id, unit_label, player_ids"),
      supabase.from("game_events").select("*").eq("side", "us").eq("event_type", "goal"),
      supabase.from("schedule_events").select("event_date, event_type"),
      supabase.from("injury_notes").select("start_date, injury_type").eq("player_id", id),
      supabase.from("player_game_advanced_stats").select("*").eq("player_id", id),
    ]);

    if (!p) {
      setNotFoundFlag(true);
      setLoading(false);
      return;
    }

    setPlayer(p);
    setAllPlayers(pls ?? []);
    setMeetings(mts ?? []);
    setAbsences(abs ?? []);
    setGameStats(pgs ?? []);
    setGames(gms ?? []);
    setTestResults(tests ?? []);
    setPenalties(pens ?? []);
    setRosterByDate(buildRosterByDate(lus ?? [], lunits ?? []));
    setAdvancedStats((adv ?? []) as PlayerGameAdvancedStat[]);
    setInjuryNotes(
      (inotes ?? [])
        .filter((n) => n.injury_type)
        .map((n) => ({ start_date: n.start_date, injury_type: n.injury_type as string }))
        .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
    );
    setTeamGoals(goals ?? []);

    // Un match prime sur une pratique quand les deux tombent le même jour :
    // c'est l'activité que le joueur a réellement manquée.
    const priority: EventType[] = ["game", "practice", "team_meeting", "pp_meeting", "team_building", "training", "individual_meeting", "other"];
    const byDate = new Map<string, EventType>();
    for (const e of sched ?? []) {
      const cur = byDate.get(e.event_date);
      if (!cur || priority.indexOf(e.event_type) < priority.indexOf(cur)) byDate.set(e.event_date, e.event_type);
    }
    // Le calendrier n'est pas toujours rempli — le 27 août, par exemple, une
    // pratique a eu lieu sans qu'aucun évènement soit inscrit. Un match ou un
    // alignement enregistré ce jour-là prouve l'activité : on s'en sert comme
    // repli, pour ne jamais afficher une absence sans dire à quoi.
    for (const g of gms ?? []) if (!byDate.has(g.game_date)) byDate.set(g.game_date, "game");
    for (const l of lus ?? []) if (!byDate.has(l.lineup_date)) byDate.set(l.lineup_date, "practice");
    setActivityByDate(new Map([...byDate].map(([d, t]) => [d, EVENT_TYPE_LABEL[t]])));
    setObjectives({
      objective_1: p.objective_1 ?? "",
      objective_2: p.objective_2 ?? "",
      objective_3: p.objective_3 ?? "",
    });
    // Un joueur sans aucun objectif s'ouvre directement en saisie — rien à
    // verrouiller. Dès qu'un objectif existe, la fiche s'ouvre verrouillée.
    setEditingObjectives(!(p.objective_1 || p.objective_2 || p.objective_3));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  /**
   * Affinités : coéquipiers avec qui le joueur a le plus souvent participé au
   * MÊME but (marqueur ou passeur). Remplace l'ancien calcul basé sur des
   * unités saisies à la main, qui n'était plus alimenté depuis que les
   * combinaisons se compilent depuis les feuilles de match.
   */
  const affinities = useMemo(() => {
    const nameOf = new Map(allPlayers.map((p) => [p.id, p.full_name]));
    const tally = new Map<string, number>();
    for (const e of teamGoals) {
      const g = gamesById.get(e.game_id);
      if (!g) continue;
      if (!inFilter(g.category)) continue;
      const involved = [e.player_id, e.assist1_player_id, e.assist2_player_id].filter(
        (x): x is string => !!x
      );
      if (!involved.includes(id)) continue;
      for (const other of involved) {
        if (other === id) continue;
        tally.set(other, (tally.get(other) ?? 0) + 1);
      }
    }
    return [...tally.entries()]
      .map(([playerId, goals]) => ({ playerId, playerName: nameOf.get(playerId) ?? "?", goals }))
      .sort((a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName))
      .slice(0, 3);
  }, [teamGoals, gamesById, statFilter, id, allPlayers]);

  const isGoalie = player?.position === "G";

  /** Statistiques restreintes au type de match choisi. */
  const filteredStats = useMemo(
    () =>
      gameStats.filter((gs) => inFilter(gamesById.get(gs.game_id)?.category)),
    [gameStats, gamesById, statFilter]
  );
  const filteredPenalties = useMemo(
    () =>
      penalties.filter((p) => inFilter(gamesById.get(p.game_id)?.category)),
    [penalties, gamesById, statFilter]
  );
  /** Punitions regroupées par type, du plus fréquent au moins fréquent. */
  const penaltyByType = useMemo(() => {
    const map = new Map<string, { label: string; count: number; minutes: number; codes: Set<string> }>();
    for (const p of filteredPenalties) {
      const parsed = parsePenaltyCode(p.penalty_code ?? "");
      const cur = map.get(parsed.label) ?? { label: parsed.label, count: 0, minutes: 0, codes: new Set<string>() };
      cur.count += 1;
      cur.minutes += parsed.minutes;
      cur.codes.add(parsed.raw);
      map.set(parsed.label, cur);
    }
    return [...map.values()]
      .map((t) => ({ ...t, codes: [...t.codes] }))
      .sort((a, b) => b.count - a.count || b.minutes - a.minutes);
  }, [filteredPenalties]);

  const penaltyMinutes = useMemo(
    () => filteredPenalties.reduce((n, p) => n + parsePenaltyCode(p.penalty_code ?? "").minutes, 0),
    [filteredPenalties]
  );

  // PJ vient de l'alignement, pas des points : un joueur habillé sans point
  // affichait 0 partie jouée.
  const gamesDressed = useMemo(
    () =>
      gamesPlayedFor(
        id,
        games,
        rosterByDate,
        activeCategories
      ).length,
    [id, games, rosterByDate, statFilter]
  );
  /** Statistiques avancées (rapport TPE) restreintes au type de match choisi. */
  const filteredAdvanced = useMemo(
    () => advancedStats.filter((a) => inFilter(gamesById.get(a.game_id)?.category)),
    [advancedStats, gamesById, statFilter]
  );

  /** Plus/moins du joueur, tel que calculé par le rapport TPE. */
  const plusMinus = useMemo(
    () => filteredAdvanced.reduce((n, a) => n + (a.plus_minus ?? 0), 0),
    [filteredAdvanced]
  );

  /** Moyenne de temps de jeu par match — absent pour les gardiens. */
  const averageToiLabel = useMemo(
    () => averageToi(filteredAdvanced.map((a) => a.toi_seconds)),
    [filteredAdvanced]
  );

  /** % de tirs transformés en buts — buts de la feuille de match, tirs du rapport TPE. */
  const shootingPercentage = useMemo(() => {
    const shots = filteredAdvanced.reduce((n, a) => n + (a.shots_on_goal ?? 0), 0);
    const goals = filteredStats.reduce((n, gs) => n + gs.goals, 0);
    return shootingPct(goals, shots);
  }, [filteredAdvanced, filteredStats]);

  /** xG individuel cumulé — seule des 6 stats xG visible hors de la fenêtre avancée. */
  const totalXg = useMemo(
    () => filteredAdvanced.reduce((n, a) => n + (a.xg ?? 0), 0),
    [filteredAdvanced]
  );

  const totals = useMemo(
    () => ({ ...skaterTotals(filteredStats), gamesPlayed: gamesDressed }),
    [filteredStats, gamesDressed]
  );
  const goalie = useMemo(() => goalieTotals(filteredStats, gamesById), [filteredStats, gamesById]);

  const opponents = useMemo(() => {
    const seen = new Map<string, string>();
    for (const gs of gameStats) {
      const g = gamesById.get(gs.game_id);
      if (!g || g.category === "hors_concours") continue;
      seen.set(g.opponent, findTeamByOpponent(g.opponent)?.name ?? g.opponent);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [gameStats, gamesById]);

  // Fiche du gardien contre une équipe : hors concours exclus, comme la fiche
  // d'équipe — un match préparatoire ne pèse pas sur un dossier réel.
  const goalieVsOpponent = useMemo(() => {
    if (!vsOpponent) return null;
    const subset = gameStats.filter((gs) => {
      const g = gamesById.get(gs.game_id);
      return g?.opponent === vsOpponent && g.category !== "hors_concours";
    });
    return goalieTotals(subset, gamesById);
  }, [vsOpponent, gameStats, gamesById]);

  // Nombre de matchs ratés pour blessure et pour suspension : une absence ne
  // compte que si elle tombe une journée où l'équipe jouait réellement.
  const missedGames = useMemo(() => {
    const gameDates = new Set(games.map((g) => g.game_date));
    const tally = { blesse: 0, suspendu: 0 };
    for (const a of absences) {
      if (!gameDates.has(a.absence_date)) continue;
      if (a.reason === "blesse") tally.blesse += 1;
      else if (a.reason === "suspendu") tally.suspendu += 1;
    }
    return tally;
  }, [absences, games]);
  /** Game log complet (filtré), du plus récent au plus ancien. */
  /**
   * Game log construit à partir des matchs où le joueur était HABILLÉ, pas de
   * ses points : un joueur sans point n'apparaissait pas du tout dans son
   * propre game log. Les statistiques sont jointes quand elles existent.
   */
  const gameLog = useMemo(() => {
    const statByGame = new Map(gameStats.map((gs) => [gs.game_id, gs]));
    const advByGame = new Map(advancedStats.map((a) => [a.game_id, a]));
    const pimByGame = new Map<string, number>();
    for (const pen of penalties) {
      pimByGame.set(
        pen.game_id,
        (pimByGame.get(pen.game_id) ?? 0) + parsePenaltyCode(pen.penalty_code ?? "").minutes
      );
    }
    return gamesPlayedFor(id, games, rosterByDate, activeCategories)
      .map((g) => {
        const gs = statByGame.get(g.id);
        const adv = advByGame.get(g.id);
        return {
          key: g.id,
          game: g,
          goals: gs?.goals ?? 0,
          assists: gs?.assists ?? 0,
          toi_minutes: gs?.toi_minutes ?? null,
          toi_seconds: adv?.toi_seconds ?? null,
          shots_on_goal: adv?.shots_on_goal ?? gs?.shots_on_goal ?? null,
          plus_minus: adv?.plus_minus ?? null,
          pim: pimByGame.get(g.id) ?? 0,
        };
      })
      .sort((a, b) => (b.game.game_date > a.game.game_date ? 1 : -1));
  }, [id, games, rosterByDate, statFilter, gameStats, advancedStats, penalties]);

  const last5 = useMemo(() => gameLog.slice(0, 5), [gameLog]);

  async function saveObjectives(e: React.FormEvent) {
    e.preventDefault();
    setSavingObjectives(true);
    setObjectivesError(null);
    // L'écriture était jusqu'ici silencieuse : un échec (session expirée,
    // règle de sécurité) laissait croire que rien ne s'était passé, alors que
    // rien n'était enregistré. On vérifie et on confirme désormais.
    const { error } = await supabase
      .from("players")
      .update({
        objective_1: objectives.objective_1 || null,
        objective_2: objectives.objective_2 || null,
        objective_3: objectives.objective_3 || null,
      })
      .eq("id", id);
    if (error) setObjectivesError(error.message);
    else {
      setObjectivesSavedAt(new Date());
      setEditingObjectives(false);
    }
    setSavingObjectives(false);
    load();
  }

  async function addMeeting(e: React.FormEvent) {
    e.preventDefault();
    setSavingMeeting(true);
    await supabase.from("meetings").insert({
      meeting_date: meetingForm.meeting_date,
      meeting_type: "individual",
      player_id: id,
      topic: meetingForm.topic || null,
      notes: meetingForm.notes || null,
      updated_by: myId,
    });
    setMeetingForm({ ...emptyMeetingForm, meeting_date: meetingForm.meeting_date });
    setSavingMeeting(false);
    setShowMeetingForm(false);
    load();
  }

  function startEditMeeting(m: Meeting) {
    setEditingMeetingId(m.id);
    setEditMeetingDraft({ meeting_date: m.meeting_date, topic: m.topic ?? "", notes: m.notes ?? "" });
  }

  async function saveEditMeeting(meetingId: string) {
    await supabase
      .from("meetings")
      .update({
        meeting_date: editMeetingDraft.meeting_date,
        topic: editMeetingDraft.topic || null,
        notes: editMeetingDraft.notes || null,
        updated_by: myId,
      })
      .eq("id", meetingId);
    setEditingMeetingId(null);
    load();
  }

  async function removeAbsence(absenceId: string) {
    await supabase.from("absences").delete().eq("id", absenceId);
    load();
  }

  async function addTestResult(e: React.FormEvent) {
    e.preventDefault();
    if (!testForm.test_name.trim() || testForm.value === "") return;
    await supabase.from("player_test_results").insert({
      player_id: id,
      test_name: testForm.test_name.trim(),
      value: Number(testForm.value),
      unit: testForm.unit || null,
      higher_is_better: testForm.higher_is_better === "true",
      test_date: testForm.test_date,
      notes: testForm.notes || null,
    });
    setTestForm({ ...emptyTestForm, test_name: testForm.test_name, unit: testForm.unit, higher_is_better: testForm.higher_is_better });
    setShowTestForm(false);
    load();
  }

  async function deleteTestResult(testId: string) {
    await supabase.from("player_test_results").delete().eq("id", testId);
    load();
  }

  if (notFoundFlag) return notFound();
  if (loading || !player) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-6">
      <Link href="/joueurs" className="text-sm text-ink-800 hover:text-gold-700 font-medium hover:underline">
        ← Joueurs
      </Link>

      <div className="card flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {player.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.photo_url}
              alt={player.full_name}
              className="h-40 w-40 sm:h-48 sm:w-48 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="h-40 w-40 sm:h-48 sm:w-48 rounded-full bg-ink-900 text-gold-400 flex items-center justify-center text-5xl font-bold shrink-0">
              {player.jersey_number ?? player.full_name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{player.full_name}</h1>
            <p className="text-slate-500 text-sm">
              {player.jersey_number ? `#${player.jersey_number} · ` : ""}
              {player.position ? POSITION_LABEL[player.position] : "Position inconnue"}
              {player.is_call_up ? " · Remplaçant" : ""}
            </p>
            <p className="text-slate-500 text-sm">
              {formatHeight(player.height_cm) ?? "Taille ?"} · {player.weight_lbs ? `${player.weight_lbs} lb` : "Poids ?"}
            </p>
          </div>
        </div>

        {/* À droite de la photo : le filtre, puis juste en dessous, les
            totaux qu'il gouverne. */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <select
            className="input w-auto h-fit"
            value={statFilter}
            onChange={(e) => setStatFilter(e.target.value as GameCategory | "all")}
            title="Type de matchs inclus dans les statistiques"
          >
            <option value="all">Tous les matchs (officiels)</option>
            <option value="saison_reguliere">Saison régulière</option>
            <option value="series">Séries</option>
            <option value="tournoi">Tournoi</option>
            <option value="hors_concours">Hors concours</option>
          </select>

          <div className="flex flex-wrap items-center justify-end gap-4 sm:gap-6">
            {isGoalie ? (
              <>
                <Stat label="PJ" value={goalie.gamesPlayed} />
                <Stat label="Fiche" value={recordLabel(goalie)} />
                <Stat label="BA" value={goalie.goalsAgainst} />
                <Stat label="Moy." value={goalie.average === null ? "-" : goalie.average.toFixed(2)} />
              </>
            ) : (
              <>
                <Stat label="PJ" value={totals.gamesPlayed} />
                <Stat label="B" value={totals.goals} />
                <Stat label="P" value={totals.assists} />
                <Stat label="PTS" value={totals.points} highlight />
                <Stat label="+/-" value={formatNet(plusMinus)} />
              </>
            )}
            <Stat label="MIN. PUN." value={penaltyMinutes} />
            {!isGoalie && filteredAdvanced.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAdvancedModal(true)}
                className="text-xs text-gold-600 hover:underline shrink-0 self-center"
                title="Voir le détail xG sur glace, par période et par match"
              >
                📊 Stats avancées
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Punitions regroupées par type d'infraction plutôt que listées une
            à une : ce qui compte pour le suivi d'un joueur, c'est de voir s'il
            récidive au bâton ou à la charge, pas la date de chaque incident. */}
        <section className="card space-y-2">
          <h2 className="font-semibold">Punitions ({penaltyMinutes} minutes)</h2>
          {penaltyByType.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune punition pour ce filtre.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-1.5 pr-4 w-14">Fois</th>
                  <th className="py-1.5 pr-4">Infraction</th>
                  <th className="py-1.5 pr-4 w-16">Min</th>
                </tr>
              </thead>
              <tbody>
                {penaltyByType.map((t) => (
                  <tr key={t.label} className="border-b last:border-0">
                    <td className="py-1.5 pr-4 font-black text-lg">{t.count}</td>
                    <td className="py-1.5 pr-4">
                      {t.label}
                      <span className="block text-xs text-slate-400 font-mono">{t.codes.join(", ")}</span>
                    </td>
                    <td className="py-1.5 pr-4 font-medium">{t.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Fiche du gardien : globale, puis contre un adversaire au choix. */}
        {isGoalie && (
          <section className="card space-y-3">
            <h2 className="font-semibold">Fiche du gardien</h2>
            <dl className="grid grid-cols-4 gap-2 text-sm">
              <div>
                <dt className="text-slate-500">Fiche</dt>
                <dd className="font-bold text-lg">{recordLabel(goalie)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Parties</dt>
                <dd className="font-bold text-lg">{goalie.gamesPlayed}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Buts alloués</dt>
                <dd className="font-bold text-lg">{goalie.goalsAgainst}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Moyenne</dt>
                <dd className="font-bold text-lg">{goalie.average === null ? "-" : goalie.average.toFixed(2)}</dd>
              </div>
            </dl>
            <p className="text-xs text-slate-400">
              {goalie.minutes.toFixed(0)} minutes jouées ({goalie.gamesEquivalent.toFixed(2)} match complet).
              Moyenne = buts alloués par match complet — 50 minutes, 45 en tournoi.
            </p>

            <div className="border-t pt-3 space-y-2">
              <label className="label mb-0">Fiche contre une équipe</label>
              <p className="text-xs text-slate-400 -mt-1">Matchs hors concours exclus.</p>
              <select className="input" value={vsOpponent} onChange={(e) => setVsOpponent(e.target.value)}>
                <option value="">— Choisir un adversaire —</option>
                {opponents.map(([abbr, name]) => (
                  <option key={abbr} value={abbr}>
                    {name}
                  </option>
                ))}
              </select>
              {goalieVsOpponent && (
                <dl className="grid grid-cols-4 gap-2 text-sm bg-slate-100 rounded-lg p-3">
                  <div>
                    <dt className="text-slate-500">Fiche</dt>
                    <dd className="font-bold">{recordLabel(goalieVsOpponent)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Parties</dt>
                    <dd className="font-bold">{goalieVsOpponent.gamesPlayed}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Buts alloués</dt>
                    <dd className="font-bold">{goalieVsOpponent.goalsAgainst}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Moyenne</dt>
                    <dd className="font-bold">
                      {goalieVsOpponent.average === null ? "-" : goalieVsOpponent.average.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              )}
              {vsOpponent && goalieVsOpponent?.gamesPlayed === 0 && (
                <p className="text-xs text-slate-500">Aucune partie jouée contre cette équipe.</p>
              )}
            </div>
          </section>
        )}

        {/* Remplace l'ancienne saisie manuelle : ces chiffres viennent
            maintenant des rapports TPE réellement téléversés après chaque
            match (voir la fiche du match), pas d'une copie à la main. Le
            détail xG sur glace reste dans la fenêtre « 📊 Stats avancées »
            de l'en-tête — ici, seuls les totaux utiles à la lecture rapide. */}
        {!isGoalie && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Statistiques avancées (TPE)</h2>
          {filteredAdvanced.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aucun rapport de statistiques avancées enregistré pour ce joueur — téléverse-le depuis la fiche du match.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-slate-500">TOI moyen</dt>
                <dd className="font-medium">{averageToiLabel}</dd>
              </div>
              <div>
                <dt className="text-slate-500">XG (saison)</dt>
                <dd className="font-medium">{totalXg.toFixed(1)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Tirs au but (saison)</dt>
                <dd className="font-medium">{filteredAdvanced.reduce((n, a) => n + (a.shots_on_goal ?? 0), 0)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">% Mises en jeu</dt>
                <dd className="font-medium">
                  {(() => {
                    const won = filteredAdvanced.reduce((n, a) => n + (a.faceoffs_won ?? 0), 0);
                    const lost = filteredAdvanced.reduce((n, a) => n + (a.faceoffs_lost ?? 0), 0);
                    return won + lost > 0 ? `${((won / (won + lost)) * 100).toFixed(1)}%` : "-";
                  })()}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">% de tirs (saison)</dt>
                <dd className="font-medium">{shootingPercentage}</dd>
              </div>
            </dl>
          )}
          <a
            href={player.tpe_profile_url || "https://portal.tpeteam.com/premium/team/9147"}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary inline-flex w-fit"
          >
            {player.tpe_profile_url ? "Ouvrir la fiche TPE du joueur →" : "Ouvrir TPE (équipe) →"}
          </a>
          {!player.tpe_profile_url && (
            <p className="text-xs text-slate-400">Ajoute le lien du profil individuel via « Modifier la fiche ».</p>
          )}
        </section>
        )}

        <section className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Rencontres individuelles ({meetings.length})</h2>
            <button className="btn-secondary text-sm" onClick={() => setShowMeetingForm((s) => !s)}>
              {showMeetingForm ? "Annuler" : "+ Loguer une rencontre"}
            </button>
          </div>
          {showMeetingForm && (
            <form onSubmit={addMeeting} className="space-y-2 border-b pb-3 mb-1">
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="label">Date</label>
                  <input
                    type="date"
                    required
                    className="input"
                    value={meetingForm.meeting_date}
                    onChange={(e) => setMeetingForm({ ...meetingForm, meeting_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Sujet</label>
                  <input
                    className="input"
                    value={meetingForm.topic}
                    onChange={(e) => setMeetingForm({ ...meetingForm, topic: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  value={meetingForm.notes}
                  onChange={(e) => setMeetingForm({ ...meetingForm, notes: e.target.value })}
                />
              </div>
              <button type="submit" className="btn" disabled={savingMeeting}>
                {savingMeeting ? "Enregistrement..." : "Enregistrer la rencontre"}
              </button>
            </form>
          )}
          {meetings.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune rencontre enregistrée.</p>
          ) : (
            <ul className="space-y-2.5 text-sm max-h-64 overflow-y-auto">
              {meetings.map((m) =>
                editingMeetingId === m.id ? (
                  <li key={m.id} className="border-b last:border-0 pb-2 space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        className="input py-1"
                        value={editMeetingDraft.meeting_date}
                        onChange={(e) => setEditMeetingDraft({ ...editMeetingDraft, meeting_date: e.target.value })}
                      />
                      <input
                        className="input py-1"
                        placeholder="Sujet"
                        value={editMeetingDraft.topic}
                        onChange={(e) => setEditMeetingDraft({ ...editMeetingDraft, topic: e.target.value })}
                      />
                    </div>
                    <textarea
                      className="input py-1"
                      rows={2}
                      placeholder="Notes"
                      value={editMeetingDraft.notes}
                      onChange={(e) => setEditMeetingDraft({ ...editMeetingDraft, notes: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveEditMeeting(m.id)} className="btn text-xs py-1">
                        Enregistrer
                      </button>
                      <button onClick={() => setEditingMeetingId(null)} className="btn-secondary text-xs py-1">
                        Annuler
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={m.id} className="border-b last:border-0 pb-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-ink-900">{m.meeting_date}</span>
                        {m.topic && <span className="font-medium text-ink-700">{m.topic}</span>}
                        {isHeadCoach && authorLabel(m.updated_by) && (
                          <span className="text-xs text-slate-400">· par {authorLabel(m.updated_by)}</span>
                        )}
                      </div>
                      <button onClick={() => startEditMeeting(m)} className="text-xs text-ink-800 hover:underline shrink-0">
                        Modifier
                      </button>
                    </div>
                    {m.notes ? (
                      <p className="text-slate-500 mt-0.5">{m.notes}</p>
                    ) : !m.topic ? (
                      <p className="text-slate-400 italic mt-0.5">Aucun sujet ni note enregistrés.</p>
                    ) : null}
                  </li>
                )
              )}
            </ul>
          )}
          <Link href="/reunions" className="text-sm text-ink-800 hover:text-gold-700 font-medium hover:underline">
            Gérer les meetings →
          </Link>
        </section>

        <section className="card space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold">
              Jours d'absence ({absences.filter((a) => !a.reason || !EXCUSED_REASONS.includes(a.reason)).length})
            </h2>
            <span className="badge bg-red-100 text-red-800">
              🩹 Blessures : {absences.filter((a) => a.reason === "blesse").length}
            </span>
            {absences.some((a) => a.reason === "sans_contact") && (
              <span className="badge bg-amber-100 text-amber-800">
                🚫 Sans contact : {absences.filter((a) => a.reason === "sans_contact").length}
              </span>
            )}
          </div>

          {/* Matchs ratés : seules les absences tombant une date de match
              comptent — une blessure un jour de pratique ne fait rater aucun match. */}
          <div className="flex items-center gap-2 flex-wrap rounded-lg bg-slate-100 px-3 py-2">
            <span className="text-sm font-semibold text-slate-700">
              Matchs ratés : {missedGames.blesse + missedGames.suspendu}
            </span>
            <span className="badge bg-red-100 text-red-800">🩹 Blessure : {missedGames.blesse}</span>
            <span className="badge bg-amber-100 text-amber-800">⛔ Suspension : {missedGames.suspendu}</span>
          </div>
          {absences.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune absence enregistrée.</p>
          ) : (
            <ul className="text-sm space-y-1 max-h-64 overflow-y-auto">
              {absences.map((a) => (
                <li key={a.id} className="border-b last:border-0 pb-1 flex items-center justify-between gap-2">
                  <span>
                    {a.absence_date}
                    {activityByDate.get(a.absence_date) ? ` · ${activityByDate.get(a.absence_date)}` : ""}
                    {a.reason ? ` — ${REASON_EMOJI[a.reason] ?? ""} ${ABSENCE_REASON_LABEL[a.reason]}`.trimEnd() : ""}
                    {(a.reason === "blesse" || a.reason === "sans_contact") && injuryTypeOn(a.absence_date) && (
                      <span className="text-red-700"> ({injuryTypeOn(a.absence_date)})</span>
                    )}
                    {/* Le sans-contact n'est pas une absence du tout : le joueur
                        était présent, il a patiné. On le dit autrement. */}
                    {a.reason === "sans_contact" ? (
                      <span className="text-xs text-amber-700"> (présent, sans contact)</span>
                    ) : (
                      a.reason &&
                      EXCUSED_REASONS.includes(a.reason) && (
                        <span className="text-xs text-slate-400"> (non comptée)</span>
                      )
                    )}
                  </span>
                  <button onClick={() => removeAbsence(a.id)} className="text-xs text-red-600 hover:underline shrink-0">
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-400">
            Blessure, suspension et remplacement M18 AAA ne sont pas comptés comme absences. Saisi via le rapport
            quotidien (« Joueurs blessés »), le popup d'absences les jours de pratique, ou le popup « blessés et
            suspendus » les jours de match.
          </p>
        </section>

        {isGoalie && (
        <section className="card space-y-2 md:col-span-2">
          <h2 className="font-semibold">🩺 Consultations en physiothérapie</h2>
          <PhysioConsultations playerId={id} />
        </section>
        )}

        <section className="card space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Game log — 5 derniers matchs</h2>
            <div className="flex gap-2 items-center flex-wrap">
              {/* Même filtre que les totaux de l'en-tête : un seul état, deux
                  points d'accès, pour ne pas avoir à remonter en haut de page. */}
              <select
                className="input w-auto"
                value={statFilter}
                onChange={(e) => setStatFilter(e.target.value as GameCategory | "all")}
              >
                <option value="all">Tous les types (officiels)</option>
                <option value="saison_reguliere">Saison régulière</option>
                <option value="series">Séries</option>
                <option value="tournoi">Tournoi</option>
                <option value="hors_concours">Hors concours</option>
              </select>
              <button className="btn-secondary" onClick={() => setShowAllGames(true)}>
                Tous les matchs ({gameLog.length})
              </button>
            </div>
          </div>

          {last5.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune statistique de match enregistrée.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-1.5 pr-4">Match</th>
                  <th className="py-1.5 pr-4">B</th>
                  <th className="py-1.5 pr-4">A</th>
                  <th className="py-1.5 pr-4">P</th>
                  <th className="py-1.5 pr-4">+/-</th>
                  <th className="py-1.5 pr-4">TOI</th>
                  <th className="py-1.5 pr-4">Tirs</th>
                  <th className="py-1.5 pr-4">Tirs %</th>
                </tr>
              </thead>
              <tbody>
                {last5.map((row) => {
                  return (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="py-1.5 pr-4">
                        <GameCell game={row.game} />
                      </td>
                      <td className="py-1.5 pr-4">{row.goals}</td>
                      <td className="py-1.5 pr-4">{row.assists}</td>
                      <td className="py-1.5 pr-4 font-medium">{row.goals + row.assists}</td>
                      <td className="py-1.5 pr-4">{row.plus_minus != null ? formatNet(row.plus_minus) : "-"}</td>
                      <td className="py-1.5 pr-4">
                        {row.toi_minutes != null ? `${row.toi_minutes} min` : secondsToToi(row.toi_seconds)}
                      </td>
                      <td className="py-1.5 pr-4">{row.shots_on_goal ?? "-"}</td>
                      <td className="py-1.5 pr-4">{shootingPct(row.goals, row.shots_on_goal ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {showAllGames && (
            <Modal onClose={() => setShowAllGames(false)}>
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Tous les matchs — {player.full_name}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {gameLog.length} match(s) · {totals.goals} but(s), {totals.assists} passe(s),{" "}
                    {totals.points} point(s)
                  </p>
                </div>
                <div className="card max-h-[65vh] overflow-y-auto">
                  {gameLog.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun match pour ce filtre.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b">
                          <th className="py-1.5 pr-4">Match</th>
                          <th className="py-1.5 pr-4">B</th>
                          <th className="py-1.5 pr-4">A</th>
                          <th className="py-1.5 pr-4">P</th>
                          <th className="py-1.5 pr-4">+/-</th>
                          <th className="py-1.5 pr-4">TOI</th>
                          <th className="py-1.5 pr-4">Tirs</th>
                          <th className="py-1.5 pr-4">Tirs %</th>
                          <th className="py-1.5 pr-4" title="Minutes de punition">MIN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gameLog.map((row) => (
                          <tr key={row.key} className="border-b last:border-0">
                            <td className="py-1.5 pr-4">
                              <GameCell game={row.game} />
                            </td>
                            <td className="py-1.5 pr-4">{row.goals}</td>
                            <td className="py-1.5 pr-4">{row.assists}</td>
                            <td className="py-1.5 pr-4 font-medium">{row.goals + row.assists}</td>
                            <td className="py-1.5 pr-4">{row.plus_minus != null ? formatNet(row.plus_minus) : "-"}</td>
                            <td className="py-1.5 pr-4">
                              {row.toi_minutes != null ? `${row.toi_minutes} min` : secondsToToi(row.toi_seconds)}
                            </td>
                            <td className="py-1.5 pr-4">{row.shots_on_goal ?? "-"}</td>
                            <td className="py-1.5 pr-4">{shootingPct(row.goals, row.shots_on_goal ?? 0)}</td>
                            <td className="py-1.5 pr-4">{row.pim || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <button className="btn-dark" onClick={() => setShowAllGames(false)}>
                  Fermer
                </button>
              </div>
            </Modal>
          )}
        </section>

        {/* Détail xG — caché de la fiche de base, visible seulement ici : les
            6 statistiques xG du rapport TPE sont trop techniques pour la
            lecture rapide de la fiche, mais doivent rester consultables. */}
        {showAdvancedModal && (
          <Modal onClose={() => setShowAdvancedModal(false)}>
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white">Statistiques avancées — {player.full_name}</h2>
                <p className="text-sm text-slate-400">xG sur glace et mises au jeu, par match — rapport TPE.</p>
              </div>
              <div className="card max-h-[65vh] overflow-y-auto overflow-x-auto">
                {filteredAdvanced.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun rapport de statistiques avancées pour ce filtre.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b">
                        <th className="py-1.5 pr-4">Match</th>
                        <th className="py-1.5 pr-4">TOI</th>
                        <th className="py-1.5 pr-4">Tirs</th>
                        <th className="py-1.5 pr-4">MAJ %</th>
                        <th className="py-1.5 pr-4">On ice xG for</th>
                        <th className="py-1.5 pr-4">On ice xG against</th>
                        <th className="py-1.5 pr-4">xG for /20</th>
                        <th className="py-1.5 pr-4">xG against /20</th>
                        <th className="py-1.5 pr-4">Xg</th>
                        <th className="py-1.5 pr-4">Xg /20</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAdvanced
                        .slice()
                        .sort((a, b) => (gamesById.get(b.game_id)?.game_date ?? "").localeCompare(gamesById.get(a.game_id)?.game_date ?? ""))
                        .map((a) => {
                          const g = gamesById.get(a.game_id);
                          return (
                            <tr key={a.id} className="border-b last:border-0">
                              <td className="py-1.5 pr-4">{g ? <GameCell game={g} /> : "?"}</td>
                              <td className="py-1.5 pr-4">{secondsToToi(a.toi_seconds)}</td>
                              <td className="py-1.5 pr-4">{a.shots_on_goal ?? "-"}</td>
                              <td className="py-1.5 pr-4">
                                {a.faceoffs_won != null && a.faceoffs_lost != null && a.faceoffs_won + a.faceoffs_lost > 0
                                  ? `${((a.faceoffs_won / (a.faceoffs_won + a.faceoffs_lost)) * 100).toFixed(0)}%`
                                  : "-"}
                              </td>
                              <td className="py-1.5 pr-4">{a.on_ice_xg_for ?? "-"}</td>
                              <td className="py-1.5 pr-4">{a.on_ice_xg_against ?? "-"}</td>
                              <td className="py-1.5 pr-4">{a.on_ice_xg_for_per20 ?? "-"}</td>
                              <td className="py-1.5 pr-4">{a.on_ice_xg_against_per20 ?? "-"}</td>
                              <td className="py-1.5 pr-4">{a.xg ?? "-"}</td>
                              <td className="py-1.5 pr-4">{a.xg_per20 ?? "-"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>
              <button className="btn-dark" onClick={() => setShowAdvancedModal(false)}>
                Fermer
              </button>
            </div>
          </Modal>
        )}

        {/* Le suivi de la clinique se lit après les matchs : c'est le contexte
            d'une absence ou d'une restriction, pas une statistique. Chez un
            gardien, il reste plus haut : sa fiche de gardien s'intercale ici et
            couperait le lien avec les absences. */}
        {!isGoalie && (
        <section className="card space-y-2 md:col-span-2">
          <h2 className="font-semibold">🩺 Consultations en physiothérapie</h2>
          <PhysioConsultations playerId={id} />
        </section>
        )}

        <section className="card space-y-3 md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Objectifs individuels — saison</h2>
              <p className="text-xs text-slate-500">Fixés avec le joueur en début d'année.</p>
            </div>
            {!editingObjectives && (
              <button
                type="button"
                onClick={() => setEditingObjectives(true)}
                className="btn-secondary text-sm shrink-0"
              >
                Modifier
              </button>
            )}
          </div>
          {objectivesError && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">
              ⚠ Non enregistré : {objectivesError}
            </p>
          )}
          {editingObjectives ? (
            <form onSubmit={saveObjectives} className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Objectif 1</label>
                <input
                  className="input"
                  value={objectives.objective_1}
                  onChange={(e) => setObjectives({ ...objectives, objective_1: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Objectif 2</label>
                <input
                  className="input"
                  value={objectives.objective_2}
                  onChange={(e) => setObjectives({ ...objectives, objective_2: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Objectif 3</label>
                <input
                  className="input"
                  value={objectives.objective_3}
                  onChange={(e) => setObjectives({ ...objectives, objective_3: e.target.value })}
                />
              </div>
              <div className="sm:col-span-3 flex items-center gap-3">
                <button type="submit" className="btn" disabled={savingObjectives}>
                  {savingObjectives ? "Enregistrement..." : "Enregistrer les objectifs"}
                </button>
                {objectivesSavedAt && !savingObjectives && !objectivesError && (
                  <span className="text-sm font-bold text-green-700">
                    ✓ Enregistré à {format(objectivesSavedAt, "HH:mm:ss")}
                  </span>
                )}
              </div>
            </form>
          ) : (
            // Verrouillé : lecture seule tant qu'on ne clique pas « Modifier ».
            <div className="grid sm:grid-cols-3 gap-3">
              {[objectives.objective_1, objectives.objective_2, objectives.objective_3].map((obj, i) => (
                <div key={i}>
                  <div className="label">Objectif {i + 1}</div>
                  <p className="text-sm text-ink-800">{obj || <span className="text-slate-400">—</span>}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Tests physiques</h2>
            <button className="btn-secondary" onClick={() => setShowTestForm((s) => !s)}>
              {showTestForm ? "Annuler" : "+ Ajouter un résultat"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Résultats à venir en temps et lieu — une fois entrés, l'onglet « Tests physiques » classera
            automatiquement tous les joueurs pour chaque test.
          </p>

          {showTestForm && (
            <form onSubmit={addTestResult} className="grid sm:grid-cols-6 gap-2 border-b pb-3">
              <input
                className="input sm:col-span-2"
                placeholder="Nom du test (ex: Saut vertical)"
                value={testForm.test_name}
                onChange={(e) => setTestForm({ ...testForm, test_name: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                className="input"
                placeholder="Valeur"
                value={testForm.value}
                onChange={(e) => setTestForm({ ...testForm, value: e.target.value })}
              />
              <input
                className="input"
                placeholder="Unité (cm, sec...)"
                value={testForm.unit}
                onChange={(e) => setTestForm({ ...testForm, unit: e.target.value })}
              />
              <select
                className="input"
                value={testForm.higher_is_better}
                onChange={(e) => setTestForm({ ...testForm, higher_is_better: e.target.value })}
              >
                <option value="true">Plus haut = mieux</option>
                <option value="false">Plus bas = mieux</option>
              </select>
              <input
                type="date"
                className="input"
                value={testForm.test_date}
                onChange={(e) => setTestForm({ ...testForm, test_date: e.target.value })}
              />
              <input
                className="input sm:col-span-6"
                placeholder="Notes (optionnel)"
                value={testForm.notes}
                onChange={(e) => setTestForm({ ...testForm, notes: e.target.value })}
              />
              <button type="submit" className="btn sm:col-span-6 w-fit">
                Enregistrer
              </button>
            </form>
          )}

          {testResults.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun test enregistré.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-1.5 pr-4">Test</th>
                  <th className="py-1.5 pr-4">Valeur</th>
                  <th className="py-1.5 pr-4">Date</th>
                  <th className="py-1.5 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {testResults.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-4">{t.test_name}</td>
                    <td className="py-1.5 pr-4 font-medium">
                      {t.value} {t.unit ?? ""}
                    </td>
                    <td className="py-1.5 pr-4">{t.test_date}</td>
                    <td className="py-1.5 pr-4">
                      <button onClick={() => deleteTestResult(t.id)} className="text-xs text-red-600 hover:underline">
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link href="/tests-physiques" className="text-sm text-ink-800 hover:text-gold-700 font-medium hover:underline">
            Voir le classement de l'équipe →
          </Link>
        </section>

        <section className="card space-y-2 md:col-span-2">
          <h2 className="font-semibold">Top 3 des meilleures affinités</h2>
          <p className="text-xs text-slate-500">
            Coéquipiers avec qui il a le plus souvent participé au même but — compilé depuis les feuilles de
            match, comme l&apos;onglet Combinaisons.
          </p>
          {affinities.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aucun but partagé pour ce filtre.{" "}
              <Link href="/stats-combos" className="text-gold-700 hover:underline">
                Voir toutes les combinaisons →
              </Link>
            </p>
          ) : (
            <>
              <ol className="text-sm space-y-1.5 list-decimal list-inside">
                {affinities.map((a) => (
                  <li key={a.playerId}>
                    <Link href={`/joueurs/${a.playerId}`} className="font-medium hover:text-gold-700 hover:underline">
                      {a.playerName}
                    </Link>{" "}
                    — {a.goals} but(s) ensemble
                  </li>
                ))}
              </ol>
              <Link href="/stats-combos" className="text-sm text-gold-700 hover:underline">
                Voir toutes les combinaisons →
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
