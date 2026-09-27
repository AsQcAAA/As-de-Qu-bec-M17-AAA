"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { RESULT_LABEL, RESULT_COLOR, matchupLabel } from "@/lib/gameResults";
import { findTeamByOpponent, teamColor, LHEQ_M17_AAA_TEAMS } from "@/lib/lheqTeams";
import { matchPlayer, parseGameSheet, type ParsedGameSheet } from "@/lib/gameSheet";
import Modal from "@/components/Modal";
import GameSheetImport, { type ImportDecision } from "@/components/GameSheetImport";
import AdvancedStatsImport, { type AdvancedStatsDecision } from "@/components/AdvancedStatsImport";
import { parsePenaltyCode } from "@/lib/penalties";
import { timeToSeconds } from "@/lib/specialTeams";
import { gameWinningGoalId } from "@/lib/gameGoals";
import { regulationMinutes } from "@/lib/playerStats";
import { titleCase } from "@/lib/players";
import { formatNet } from "@/lib/tpeReport";
import type { ParsedAdvancedReport } from "@/lib/tpeReport";
import type { Game, GameDocument, GameDocumentType, GameEvent, Player, PlayerGameAdvancedStat, PlayerGameStat } from "@/lib/types";

const DOC_TYPE_LABEL: Record<GameDocumentType, string> = {
  feuille_match: "Feuille de match",
  stats_avancees: "Rapport de statistiques avancées (TPE)",
  plus_moins: "Sommaire du match (archive)",
};

// N'affiche plus de case de téléversement dédiée : le +/- et les autres
// statistiques individuelles viennent maintenant du rapport TPE
// (stats_avancees). D'anciens fichiers "plus_moins" restent en base si
// besoin de les consulter directement dans Supabase, mais la case a disparu.
const UPLOAD_DOC_TYPES: GameDocumentType[] = ["feuille_match", "stats_avancees"];

/**
 * Extrait les champs texte du PDF de la ligue (formulaire AcroForm).
 * pdf-lib est chargé à la demande : il ne pèse sur le bundle que sur cette page.
 */
async function readPdfFormFields(file: File): Promise<Record<string, string>> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const form = doc.getForm();
  const fields: Record<string, string> = {};
  for (const f of form.getFields()) {
    const name = f.getName();
    try {
      const text = form.getTextField(name).getText();
      if (text != null && text.trim() !== "") fields[name] = text.trim();
    } catch {
      // champ non textuel (case à cocher, signature) — sans intérêt ici
    }
  }
  return fields;
}

export default function GameDetailPage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const supabase = createClient();

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<PlayerGameStat[]>([]);
  const [documents, setDocuments] = useState<GameDocument[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  /** Statistiques avancées (rapport TPE) de ce match — alimente la colonne +/-. */
  const [advancedStats, setAdvancedStats] = useState<PlayerGameAdvancedStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<GameDocumentType | null>(null);

  const [resultForm, setResultForm] = useState({ notes: "" });
  const [savingResult, setSavingResult] = useState(false);

  const [parsedSheet, setParsedSheet] = useState<ParsedGameSheet | null>(null);
  const [applyingSheet, setApplyingSheet] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const [parsedAdvanced, setParsedAdvanced] = useState<ParsedAdvancedReport | null>(null);
  const [applyingAdvanced, setApplyingAdvanced] = useState(false);
  const [readingAdvanced, setReadingAdvanced] = useState(false);
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  async function load() {
    const [{ data: g }, { data: pls }, { data: st }, { data: docs }, { data: ev }, { data: adv }] = await Promise.all([
      supabase.from("games").select("*").eq("id", gameId).single(),
      supabase.from("players").select("*").eq("active", true).order("jersey_number"),
      supabase.from("player_game_stats").select("*").eq("game_id", gameId),
      supabase.from("game_documents").select("*").eq("game_id", gameId).order("uploaded_at", { ascending: false }),
      supabase.from("game_events").select("*").eq("game_id", gameId).order("period"),
      supabase.from("player_game_advanced_stats").select("*").eq("game_id", gameId),
    ]);
    setGame(g ?? null);
    setPlayers(pls ?? []);
    setStats(st ?? []);
    setDocuments(docs ?? []);
    setAdvancedStats((adv ?? []) as PlayerGameAdvancedStat[]);
    // Tri chronologique réel : la requête ne trie que par période, et le temps
    // est un texte ("04:47"), donc « 12:20 » se retrouvait avant « 03:42 ».
    setEvents(
      [...(ev ?? [])].sort(
        (a, b) =>
          Number(a.period ?? 0) - Number(b.period ?? 0) ||
          timeToSeconds(a.time) - timeToSeconds(b.time)
      )
    );
    if (g) {
      setResultForm({ notes: g.notes ?? "" });
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  /**
   * Feuille de pointage du match : points ET minutes de punition.
   *
   * Un joueur qui n'a pas marqué mais qui a écopé doit figurer ici — sans quoi
   * la mêlée de fin de match disparaissait du sommaire.
   */
  const scorers = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p]));
    const pim = new Map<string, number>();
    for (const e of events) {
      if (e.side !== "us" || e.event_type !== "penalty" || !e.player_id) continue;
      pim.set(e.player_id, (pim.get(e.player_id) ?? 0) + parsePenaltyCode(e.penalty_code ?? "").minutes);
    }

    // Le +/- vient du rapport de statistiques avancées TPE, rattaché au joueur.
    const advancedById = new Map(advancedStats.map((a) => [a.player_id, a]));
    const plusMinus = (player: Player) => advancedById.get(player.id)?.plus_minus ?? 0;

    type Row = { player: Player; goals: number; assists: number; points: number; pim: number; plusMinus: number };
    const rows = stats
      .map((s) => {
        const player = byId.get(s.player_id);
        if (!player) return null;
        return {
          player,
          goals: s.goals,
          assists: s.assists,
          points: s.goals + s.assists,
          pim: pim.get(s.player_id) ?? 0,
          plusMinus: plusMinus(player),
        };
      })
      .filter((x): x is Row => !!x);

    // Les joueurs punis sans point n'ont pas de ligne de statistiques : on les
    // ajoute, sinon leurs minutes n'apparaîtraient nulle part.
    for (const [playerId, minutes] of pim) {
      if (rows.some((r) => r.player.id === playerId)) continue;
      const player = byId.get(playerId);
      if (player) rows.push({ player, goals: 0, assists: 0, points: 0, pim: minutes, plusMinus: plusMinus(player) });
    }

    // Un joueur peut n'avoir ni point ni punition et avoir été sur la glace :
    // son +/- justifie à lui seul une ligne.
    for (const a of advancedStats) {
      const player = byId.get(a.player_id);
      if (!player || rows.some((r) => r.player.id === player.id)) continue;
      rows.push({ player, goals: 0, assists: 0, points: 0, pim: 0, plusMinus: plusMinus(player) });
    }

    return rows
      .filter((r) => r.points > 0 || r.pim > 0 || r.plusMinus !== 0)
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.goals - a.goals ||
          b.pim - a.pim ||
          (a.player.jersey_number ?? 99) - (b.player.jersey_number ?? 99)
      );
  }, [stats, players, events, advancedStats]);

  /** Gardiens ayant joué ce match (minutes attribuées). */
  const goalieRows = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p]));
    return stats
      .map((s) => {
        const player = byId.get(s.player_id);
        if (!player || player.position !== "G" || (s.toi_minutes ?? 0) <= 0) return null;
        return { player, minutes: s.toi_minutes ?? 0, goalsAgainst: s.goals_against ?? 0 };
      })
      .filter((x): x is { player: Player; minutes: number; goalsAgainst: number } => !!x)
      .sort((a, b) => b.minutes - a.minutes);
  }, [stats, players]);

  const totals = useMemo(
    () =>
      scorers.reduce(
        (acc, s) => ({
          goals: acc.goals + s.goals,
          assists: acc.assists + s.assists,
          points: acc.points + s.points,
          pim: acc.pim + s.pim,
        }),
        { goals: 0, assists: 0, points: 0, pim: 0 }
      ),
    [scorers]
  );

  async function saveNotes(e: React.FormEvent) {
    e.preventDefault();
    setSavingResult(true);
    await supabase
      .from("games")
      // Volontairement limité aux notes : le pointage appartient à la feuille
      // de match, et le réécrire ici risquerait de l'écraser avec une valeur périmée.
      .update({ notes: resultForm.notes || null })
      .eq("id", gameId);
    setSavingResult(false);
    load();
  }

  async function uploadDocument(docType: GameDocumentType, file: File) {
    setUploading(docType);
    setSheetError(null);
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `${gameId}-${docType}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("game-documents").upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from("game-documents").getPublicUrl(path);
      await supabase.from("game_documents").insert({
        game_id: gameId,
        doc_type: docType,
        file_url: data.publicUrl,
        file_name: file.name,
      });
      // La feuille de match officielle est un PDF-formulaire : on la lit tout
      // de suite pour proposer la compilation, sans rien écrire encore.
      if (docType === "feuille_match" && !file.name.toLowerCase().endsWith(".pdf")) {
        // Une photo de la feuille carbone manuscrite ne contient aucune donnée
        // exploitable : seule la version PDF de la ligue est un formulaire.
        setSheetError(
          "Ce fichier est une image. Seule la feuille de match officielle en PDF (celle de la ligue) peut être lue automatiquement — une photo de la feuille papier ne contient aucune donnée exploitable."
        );
      } else if (docType === "stats_avancees") {
        // Rapport TPE : mise en page libre, lu par Claude — la lecture est
        // proposée à la relecture avant tout enregistrement.
        await readAdvancedReport(data.publicUrl);
      } else if (docType === "feuille_match") {
        try {
          const fields = await readPdfFormFields(file);
          if (Object.keys(fields).length === 0) {
            setSheetError(
              "Ce PDF ne contient aucun champ de formulaire — il s'agit probablement d'un scan. Saisis les points à la main ci-dessous."
            );
          } else {
            setParsedSheet(parseGameSheet(fields));
          }
        } catch {
          setSheetError("Lecture automatique impossible pour ce fichier. Saisis les points à la main ci-dessous.");
        }
      }
      load();
    }
    setUploading(null);
  }

  /** Relit une feuille déjà téléversée (utile après une correction d'effectif). */
  async function reparseDocument(doc: GameDocument) {
    setSheetError(null);
    try {
      const res = await fetch(doc.file_url);
      const blob = await res.blob();
      const fields = await readPdfFormFields(new File([blob], doc.file_name ?? "feuille.pdf"));
      if (Object.keys(fields).length === 0) {
        setSheetError("Ce PDF ne contient aucun champ de formulaire — saisis les points à la main ci-dessous.");
        return;
      }
      setParsedSheet(parseGameSheet(fields));
    } catch {
      setSheetError("Impossible de relire ce fichier.");
    }
  }

  /** Applique ce que l'utilisateur a validé dans l'aperçu de la feuille. */
  async function applySheet(decision: ImportDecision) {
    setApplyingSheet(true);
    if (decision.result || decision.goalsFor != null) {
      await supabase
        .from("games")
        .update({
          result: decision.result,
          goals_for: decision.goalsFor,
          goals_against: decision.goalsAgainst,
          pp_goals: decision.specialTeams.ppGoals,
          pp_opportunities: decision.specialTeams.ppOpportunities,
          pk_kills: decision.specialTeams.pkKills,
          pk_opportunities: decision.specialTeams.pkOpportunities,
        })
        .eq("id", gameId);
    }
    // Sommaire : on remplace les évènements du match plutôt que d'accumuler
    // des doublons si la feuille est appliquée deux fois.
    await supabase.from("game_events").delete().eq("game_id", gameId);
    if (decision.events.length > 0) {
      // Seuls NOS joueurs sont rattachés à une fiche ; les adversaires ne
      // vivent que par leur nom, tel qu'inscrit sur la feuille.
      const idFor = (name: string | null, side: "us" | "opponent") => {
        if (!name || side !== "us") return null;
        const m = matchPlayer(name, players);
        return m?.confidence === "exact" ? m.player.id : null;
      };
      await supabase.from("game_events").insert(
        decision.events.map((e) => ({
          game_id: gameId,
          side: e.side,
          event_type: e.type,
          period: e.period,
          time: e.time,
          player_id: idFor(e.playerName, e.side),
          player_name: e.playerName,
          jersey_number: e.jersey ? Number(e.jersey) : null,
          assist1_name: e.assists[0]?.name ?? null,
          assist1_jersey: e.assists[0] ? Number(e.assists[0].jersey) : null,
          assist1_player_id: idFor(e.assists[0]?.name ?? null, e.side),
          assist2_name: e.assists[1]?.name ?? null,
          assist2_jersey: e.assists[1] ? Number(e.assists[1].jersey) : null,
          assist2_player_id: idFor(e.assists[1]?.name ?? null, e.side),
          penalty_code: e.code,
          situation: e.situation ?? null,
        }))
      );
    }

    // Gardiens : minutes et buts alloués, pour la moyenne de chaque gardien.
    if (decision.goalies.length > 0) {
      await supabase.from("player_game_stats").upsert(
        decision.goalies.map((g) => ({
          player_id: g.playerId,
          game_id: gameId,
          goals: 0,
          assists: 0,
          toi_minutes: g.minutes,
          goals_against: g.goalsAgainst,
        })),
        { onConflict: "player_id,game_id" }
      );
    }
    if (decision.lines.length > 0) {
      await supabase.from("player_game_stats").upsert(
        decision.lines.map((l) => ({
          player_id: l.playerId!,
          game_id: gameId,
          goals: l.goals,
          assists: l.assists,
        })),
        { onConflict: "player_id,game_id" }
      );
    }
    setApplyingSheet(false);
    setParsedSheet(null);
    load();
  }

  /** Fait lire le rapport TPE par le serveur — rien n'est écrit à ce stade. */
  async function readAdvancedReport(fileUrl: string) {
    setReadingAdvanced(true);
    setAdvancedError(null);
    try {
      const res = await fetch("/api/advanced-stats/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAdvancedError(body.error ?? "Lecture impossible.");
        return;
      }
      setParsedAdvanced(body as ParsedAdvancedReport);
    } catch {
      setAdvancedError("Lecture impossible — le serveur n'a pas répondu.");
    } finally {
      setReadingAdvanced(false);
    }
  }

  /** Relit un rapport TPE déjà téléversé. */
  async function reparseAdvanced(doc: GameDocument) {
    await readAdvancedReport(doc.file_url);
  }

  /** Applique ce que l'utilisateur a validé dans l'aperçu du rapport TPE. */
  async function applyAdvancedStats(decision: AdvancedStatsDecision) {
    setApplyingAdvanced(true);
    await supabase
      .from("games")
      .update({
        shots_on_goal_us: decision.shots?.us.total.shotsOnGoal ?? null,
        shots_on_goal_opponent: decision.shots?.opponent.total.shotsOnGoal ?? null,
        shots_breakdown: decision.shots,
        faceoffs_us_won: decision.faceoffs?.total.won ?? null,
        faceoffs_us_lost: decision.faceoffs?.total.lost ?? null,
        faceoff_breakdown: decision.faceoffs,
        faceoff_zone_map: decision.faceoffZones,
        team_xg_us: decision.teamXgUs,
        team_xg_opponent: decision.teamXgOpponent,
      })
      .eq("id", gameId);
    if (decision.lines.length > 0) {
      await supabase.from("player_game_advanced_stats").upsert(
        decision.lines.map((l) => ({
          player_id: l.playerId!,
          game_id: gameId,
          toi_seconds: l.toiSeconds,
          shots_on_goal: l.shotsOnGoal,
          faceoffs_won: l.faceoffsWon,
          faceoffs_lost: l.faceoffsLost,
          plus_minus: l.plusMinus,
          on_ice_xg_for: l.onIceXgFor,
          on_ice_xg_against: l.onIceXgAgainst,
          on_ice_xg_for_per20: l.onIceXgForPer20,
          on_ice_xg_against_per20: l.onIceXgAgainstPer20,
          xg: l.xg,
          xg_per20: l.xgPer20,
        })),
        { onConflict: "player_id,game_id" }
      );
    }
    setApplyingAdvanced(false);
    setParsedAdvanced(null);
    load();
  }

  async function removeDocument(id: string) {
    await supabase.from("game_documents").delete().eq("id", id);
    load();
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;
  if (!game) return <p className="text-slate-500">Match introuvable.</p>;

  const winningGoalId = gameWinningGoalId(events, game);
  const opponentTeam = findTeamByOpponent(game.opponent);
  const opponentName = opponentTeam?.name ?? game.opponent;
  const ourTeam = LHEQ_M17_AAA_TEAMS.find((t) => t.slug === "as-de-quebec");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/resultats" className="text-sm text-slate-400 hover:text-gold-400 hover:underline">
          ← Retour aux résultats
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold">
              {matchupLabel(game, opponentName)}
            </h1>
            <p className="text-slate-500 text-sm capitalize">
              {format(parseISO(game.game_date), "EEEE d MMMM yyyy", { locale: fr })}
              {game.location ? ` — ${game.location}` : ""}
            </p>
          </div>
          {game.result && (
            <span className={`badge text-base ${RESULT_COLOR[game.result]}`}>
              {RESULT_LABEL[game.result]} {game.goals_for ?? "-"}–{game.goals_against ?? "-"}
            </span>
          )}
        </div>
      </div>

      {/* Notes du match. Aucune saisie manuelle du pointage : chaque match —
          hors concours, saison, tournoi, séries, provinciaux — a sa feuille
          officielle, qui reste la seule source du résultat et des points. */}
      <form onSubmit={saveNotes} className="card space-y-3">
        <div>
          <label className="label">Notes sur le match</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Observations, ajustements, points à revoir avec l'équipe..."
            value={resultForm.notes}
            onChange={(e) => setResultForm({ ...resultForm, notes: e.target.value })}
          />
        </div>
        <button type="submit" className="btn" disabled={savingResult}>
          {savingResult ? "Enregistrement..." : "Enregistrer les notes"}
        </button>
      </form>

      <div className="card space-y-4">
        <h2 className="font-semibold">Documents du match</h2>
        <p className="text-sm text-slate-500">
          Téléverse la feuille de match officielle de la ligue : l&apos;application la lit
          automatiquement et te propose le pointage, le résultat et les buts/passes de chaque joueur —
          à valider avant enregistrement. Le rapport de statistiques avancées (TPE) fournit le temps de jeu, les
          tirs, les mises au jeu, le xG et le +/- de chaque joueur — également à valider avant enregistrement.
        </p>

        {sheetError && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
            {sheetError}
          </p>
        )}
        {advancedError && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
            {advancedError}
          </p>
        )}

        {parsedSheet && (
          <Modal onClose={() => setParsedSheet(null)}>
            <GameSheetImport
              parsed={parsedSheet}
              players={players}
              applying={applyingSheet}
              onApply={applySheet}
              onCancel={() => setParsedSheet(null)}
            />
          </Modal>
        )}
        {parsedAdvanced && (
          <Modal onClose={() => setParsedAdvanced(null)}>
            <AdvancedStatsImport
              parsed={parsedAdvanced}
              players={players}
              applying={applyingAdvanced}
              onApply={applyAdvancedStats}
              onCancel={() => setParsedAdvanced(null)}
            />
          </Modal>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          {UPLOAD_DOC_TYPES.map((docType) => (
            // L'ancre permet au pense-bête de l'accueil de pointer sur la
            // bonne case ; scroll-mt dégage la barre du haut à l'arrivée.
            <div
              key={docType}
              id={`upload-${docType}`}
              className="border border-white/10 rounded-lg p-3 space-y-2 scroll-mt-24 target:border-gold-400"
            >
              <div className="text-sm font-medium">{DOC_TYPE_LABEL[docType]}</div>
              <label className="btn-secondary inline-block cursor-pointer text-sm">
                {uploading === docType ? "Téléversement..." : "+ Téléverser un fichier"}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv"
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadDocument(docType, file);
                    e.target.value = "";
                  }}
                />
              </label>
              <ul className="text-sm space-y-1">
                {documents
                  .filter((d) => d.doc_type === docType)
                  .map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 border-t border-white/10 pt-1 first:border-0 first:pt-0">
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold-400 hover:text-gold-300 hover:underline truncate"
                      >
                        {d.file_name ?? "Voir le fichier"} →
                      </a>
                      <span className="flex gap-2 shrink-0">
                        {docType === "feuille_match" && (
                          <button onClick={() => reparseDocument(d)} className="text-xs text-gold-400 hover:underline">
                            Relire
                          </button>
                        )}
                        {docType === "stats_avancees" && (
                          <button
                            onClick={() => reparseAdvanced(d)}
                            disabled={readingAdvanced}
                            className="text-xs text-gold-400 hover:underline"
                          >
                            {readingAdvanced ? "Lecture..." : "Relire"}
                          </button>
                        )}
                        <button onClick={() => removeDocument(d.id)} className="text-xs text-red-500 hover:underline">
                          Retirer
                        </button>
                      </span>
                    </li>
                  ))}
                {documents.filter((d) => d.doc_type === docType).length === 0 && (
                  <li className="text-slate-500">Aucun fichier téléversé.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Sommaire du match — pointage en tête, puis les évènements groupés
          par période sous un bandeau noir. Les buts sont plus foncés que les
          punitions pour se repérer d'un coup d'œil. */}
      {events.length > 0 && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Sommaire du match</h2>

          {/* Pointage, dans l'ordre d'affichage : visiteur d'abord. */}
          <div className="flex items-center justify-center gap-6 sm:gap-10 py-2">
            {[game.is_home ? "opponent" : "us", game.is_home ? "us" : "opponent"].map((who, idx) => {
              const isUs = who === "us";
              const team = isUs ? ourTeam : opponentTeam;
              const goals = isUs ? game.goals_for : game.goals_against;
              return (
                <div key={idx} className="flex flex-col items-center gap-1 w-28 sm:w-36">
                  {team && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={team.logo} alt={team.name} className="h-16 w-16 sm:h-20 sm:w-20 object-contain" />
                  )}
                  <span className="text-4xl sm:text-5xl font-black tabular-nums">{goals ?? "-"}</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-center leading-tight">
                    {isUs ? "As de Québec" : (opponentTeam?.name ?? opponentName)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Un bloc par période. */}
          {[...new Set(events.map((e) => e.period ?? "?"))].sort().map((period) => (
            <div key={period} className="space-y-1">
              <div className="bg-black text-white text-xs font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded">
                {period === "1" ? "1re période" : period === "2" ? "2e période" : period === "3" ? "3e période" : `Période ${period}`}
              </div>
              {events
                .filter((e) => (e.period ?? "?") === period)
                .map((e) => {
                  const us = e.side === "us";
                  const isGoal = e.event_type === "goal";
                  const pen = isGoal ? null : parsePenaltyCode(e.penalty_code ?? "");
                  const accent = us ? "#fdca37" : teamColor(opponentTeam?.slug);
                  const assists = [
                    e.assist1_jersey || e.assist1_name
                      ? `#${e.assist1_jersey ?? "?"} ${e.assist1_name ? titleCase(e.assist1_name) : ""}`.trim()
                      : null,
                    e.assist2_jersey || e.assist2_name
                      ? `#${e.assist2_jersey ?? "?"} ${e.assist2_name ? titleCase(e.assist2_name) : ""}`.trim()
                      : null,
                  ].filter(Boolean);
                  // Rien n'est écrit à forces égales : seules les situations
                  // spéciales méritent d'être signalées.
                  const situation =
                    e.situation === "pp" ? "Avantage numérique" : e.situation === "sh" ? "Désavantage numérique" : null;
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 rounded px-3 py-2"
                      style={
                        isGoal
                          ? { backgroundColor: accent, color: us ? "#0d0c0c" : "#ffffff" }
                          : { backgroundColor: `${accent}26`, borderLeft: `4px solid ${accent}` }
                      }
                    >
                      <span className="text-[11px] font-black uppercase tracking-wider w-16 shrink-0">
                        {isGoal ? "But" : "Punition"}
                      </span>
                      <span className="flex-1 min-w-0 text-sm">
                        <span className="font-bold">
                          #{e.jersey_number ?? "?"} {e.player_name ? titleCase(e.player_name) : "—"}
                        </span>
                        {isGoal ? (
                          assists.length > 0 ? (
                            <span className="opacity-80"> · Aides : {assists.join(", ")}</span>
                          ) : (
                            <span className="opacity-70"> · sans aide</span>
                          )
                        ) : (
                          <span className="text-slate-700">
                            {" "}
                            · {pen?.label}
                            {pen && pen.minutes > 0 ? ` (${pen.minutes} min)` : ""}
                          </span>
                        )}
                        {isGoal && situation && (
                          <span className="ml-2 inline-block rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide align-middle">
                            {situation}
                          </span>
                        )}
                        {isGoal && e.id === winningGoalId && (
                          <span className="ml-2 inline-block rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide align-middle">
                            But gagnant
                          </span>
                        )}
                      </span>
                      <span className="text-lg font-black tabular-nums shrink-0">{e.time ?? ""}</span>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      )}


      {/* Gardiens : minutes et buts alloués, lus sur la feuille de match. */}
      {goalieRows.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Gardiens</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4 w-12">#</th>
                  <th className="py-2 pr-4">Gardien</th>
                  <th className="py-2 pr-4 w-24">Minutes</th>
                  <th className="py-2 pr-4 w-24">Buts alloués</th>
                  <th className="py-2 pr-4 w-24">Moyenne</th>
                </tr>
              </thead>
              <tbody>
                {goalieRows.map(({ player, minutes, goalsAgainst }) => (
                  <tr key={player.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-bold">{player.jersey_number ?? "-"}</td>
                    <td className="py-2 pr-4">{player.full_name}</td>
                    <td className="py-2 pr-4">{minutes.toFixed(0)}</td>
                    <td className="py-2 pr-4">{goalsAgainst}</td>
                    <td className="py-2 pr-4 font-bold">
                      {minutes > 0 ? ((goalsAgainst * regulationMinutes(game)) / minutes).toFixed(2) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Résumé des pointeurs — lecture seule.
          Les buts et passes viennent de la feuille de match : les saisir à la
          main ici serait redondant et risquerait de contredire l'officiel. */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Pointeurs du match</h2>
        {scorers.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun point enregistré. Téléverse la feuille de match ci-dessus : les buts et les passes de
            chaque joueur seront compilés automatiquement.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-4 w-12">#</th>
                    <th className="py-2 pr-4">Joueur</th>
                    <th className="py-2 pr-4 w-16">B</th>
                    <th className="py-2 pr-4 w-16">P</th>
                    <th className="py-2 pr-4 w-16">PTS</th>
                    <th className="py-2 pr-4 w-16" title="Plus/moins — sur la glace lors des buts à égalité ou en infériorité">+/-</th>
                    <th className="py-2 pr-4 w-16" title="Minutes de punition">MIN</th>
                  </tr>
                </thead>
                <tbody>
                  {scorers.map(({ player, goals, assists, points, pim, plusMinus }) => (
                    <tr key={player.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-bold">{player.jersey_number ?? "-"}</td>
                      <td className="py-2 pr-4">{player.full_name}</td>
                      <td className="py-2 pr-4">{goals}</td>
                      <td className="py-2 pr-4">{assists}</td>
                      <td className="py-2 pr-4 font-bold">{points}</td>
                      <td
                        className={`py-2 pr-4 font-bold tabular-nums ${
                          plusMinus > 0 ? "text-green-700" : plusMinus < 0 ? "text-red-700" : "text-slate-400"
                        }`}
                      >
                        {formatNet(plusMinus)}
                      </td>
                      <td className="py-2 pr-4">{pim || "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold">
                    <td className="py-2 pr-4" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2 pr-4">{totals.goals}</td>
                    <td className="py-2 pr-4">{totals.assists}</td>
                    <td className="py-2 pr-4">{totals.points}</td>
                    <td className="py-2 pr-4"></td>
                    <td className="py-2 pr-4">{totals.pim}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              {scorers.filter((r) => r.points > 0).length} joueur(s) au pointage sur {totals.goals} but(s) ·{" "}
              {totals.pim} minute(s) de punition.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
