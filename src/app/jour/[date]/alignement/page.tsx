"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import JerseySlot, { type JerseySkin } from "@/components/JerseySlot";
import { lastName } from "@/lib/players";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { matchupLabel } from "@/lib/gameResults";
import {
  ABSENCE_REASON_LABEL,
  GAME_DAY_REASONS,
  GAME_MISSED_LABEL,
  PRACTICE_STATUS_REASONS,
  REASON_EMOJI,
  isPresentStatus,
} from "@/lib/absenceReasons";
import { EVENT_TYPE_LABEL, showsLocation } from "@/lib/eventTypes";
import { printWithOrientation } from "@/lib/print";
import { isDayOff } from "@/lib/dayType";
import { useCoachDirectory } from "@/lib/useCoach";
import {
  byAnnounceOrder,
  detailedPositionOf as detailedPosition,
  type RosterGrid,
} from "@/lib/lineupPositions";
import Modal from "@/components/Modal";
import GamePlanEditor from "@/components/GamePlanEditor";
import DayScheduleEditor from "@/components/DayScheduleEditor";
import type { Absence, AbsenceReason, Game, Lineup, LineupUnit, Player, ScheduleEvent, UnitType } from "@/lib/types";

// Gabarit d'effectif du jour : 10 attaquants (grille 3 colonnes), 7 défenseurs
// (grille 2 colonnes), 2 gardiens (1 colonne).
const ROSTER_TEMPLATE: {
  label: string;
  unitType: UnitType;
  slots: number;
  color: "gold" | "gris";
  position: "F" | "D" | "G";
  gridCols: string;
  icon: string;
  short: string;
}[] = [
  { label: "Attaquants (effectif)", unitType: "forward_line", slots: 10, color: "gold", position: "F", gridCols: "grid-cols-3", icon: "🏒", short: "Attaquants" },
  { label: "Défenseurs (effectif)", unitType: "defense_pair", slots: 7, color: "gris", position: "D", gridCols: "grid-cols-2", icon: "🛡️", short: "Défenseurs" },
  { label: "Gardiens (effectif)", unitType: "defense_pair", slots: 2, color: "gris", position: "G", gridCols: "grid-cols-1", icon: "🥅", short: "Gardiens" },
];

// Delarosbil est un rappel, mais s'entraîne avec le groupe assez régulièrement
// pour rester sélectionnable dans l'alignement des pratiques (seule exception).
// Les jours de match, TOUS les remplaçants sont sélectionnables : c'est là
// qu'on fait appel à un suppléant pour combler un absent.
const ALIGNMENT_CALL_UP_EXCEPTION_ID = "f34e7b01-52be-4810-848c-466a3ede78a6";

// L'équipe habille 18 joueurs : 16 patineurs + 2 gardiens. Les cases affichées
// (10 attaquants, 7 défenseurs) laissent le choix de la répartition — 10F+6D ou
// 9F+7D — mais le total des patineurs ne doit pas dépasser 16.
const DRESSED_TOTAL = 18;
const DRESSED_SKATERS = 16;
// À l'entraînement, rien n'oblige à s'en tenir à l'effectif d'un match : un
// patineur de plus peut sauter sur la glace.
const PRACTICE_SKATERS = 17;

// Cinq partant : stocké comme une unité d'alignement ordinaire, ce qui évite
// une table dédiée. Le libellé sert de clé.
const STARTERS_LABEL = "Partants (match)";
const STARTER_SKATERS = 5;

// Trios (attaquants, 3 joueurs) et duos (défenseurs, 2 joueurs) — formés en
// cliquant directement sur un chandail du gabarit ci-dessus, qui fait
// cycler son groupe : neutre → gris → jaune → neutre.
const GROUPING: Record<"F" | "D", { unitType: UnitType; prefix: string; capacity: number }> = {
  F: { unitType: "forward_line", prefix: "Trio", capacity: 3 },
  D: { unitType: "defense_pair", prefix: "Duo", capacity: 2 },
};
const CYCLE: ("gris" | "jaune" | null)[] = [null, "gris", "jaune"];

/** Une ligne du panneau « Alignement partant ». */
function StarterRow({ player, onRemove }: { player: Player; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2 py-1.5">
      {player.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={player.photo_url}
          alt={player.full_name}
          className="h-8 w-8 shrink-0 rounded-full border border-white/30 object-cover"
        />
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-full bg-ink-900 text-gold-400 text-xs font-black flex items-center justify-center">
          {player.jersey_number ?? "–"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-black text-white truncate">
          {player.jersey_number ? `#${player.jersey_number} ` : ""}
          {lastName(player.full_name)}
        </span>
        {player.is_call_up && <span className="block text-[10px] font-bold text-gold-400">Remplaçant</span>}
      </span>
      <button
        type="button"
        onClick={onRemove}
        title="Retirer du cinq partant"
        className="shrink-0 text-slate-500 hover:text-red-400 text-sm leading-none px-1"
      >
        ✕
      </button>
    </div>
  );
}

export default function AlignementRapidePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  const supabase = createClient();
  const { myId, isHeadCoach, authorLabel } = useCoachDirectory();
  const searchParams = useSearchParams();
  // Permet d'exporter en un clic depuis le pense-bête de la journée (JourContent) :
  // ?print=1 déclenche l'impression dès que l'alignement est chargé, sans repasser
  // par cette page pour cliquer sur « Exporter ».
  const autoPrint = searchParams.get("print") === "1";
  const autoPrinted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lineup, setLineup] = useState<Lineup | null>(null);
  const [units, setUnits] = useState<LineupUnit[]>([]);
  /**
   * Miroir synchrone de `units`.
   *
   * Les gestionnaires enchaînent des `await` (insert/update Supabase) : lire
   * l'état capturé par la fermeture du rendu renverrait une version périmée
   * après l'attente, et la réécrire écraserait les choix faits entre-temps.
   * C'est ce qui faisait disparaître les attaquants : le clic sur l'étoile
   * restaurait un instantané d'avant leur sélection, puis la modification
   * suivante recopiait ce tableau vidé en base.
   * Toute écriture passe donc par applyUnits(), qui met la ref à jour
   * immédiatement, et toute lecture dans un gestionnaire lit la ref.
   */
  const unitsRef = useRef<LineupUnit[]>([]);
  function applyUnits(next: LineupUnit[]) {
    unitsRef.current = next;
    setUnits(next);
  }
  const [game, setGame] = useState<Game | null>(null);
  const [replicating, setReplicating] = useState(false);
  // Case en cours de glissement — sert aussi à mettre en évidence les cases
  // d'arrivée valides pendant le déplacement.
  const [dragFrom, setDragFrom] = useState<{ label: string; index: number; position: "F" | "D" | "G" } | null>(null);
  // Joueurs qui ratent le match (blessure / suspension) — comptés comme matchs
  // ratés dans leur fiche.
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [addAbsentId, setAddAbsentId] = useState("");
  // Horaire du jour (meetings, départ, etc.) — repris dans la feuille imprimée.
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [editing, setEditing] = useState<"plan" | "horaire" | null>(null);
  // Chaque modification est déjà écrite en base au fil de l'eau ; ce bouton
  // réécrit l'alignement complet et le confirme à l'écran.
  const [savingAll, setSavingAll] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * L'alignement du jour, créé au besoin.
   *
   * Retourne `null` plutôt que de forcer un type : quand la session a expiré,
   * la lecture ne renvoie rien ET l'écriture est refusée par la sécurité de la
   * base. L'ancien `created!` produisait alors un `null` déguisé en Lineup, et
   * la page plantait à la ligne suivante — ce qui gelait toute la navigation.
   */
  async function ensureLineup(): Promise<Lineup | null> {
    const { data: existing } = await supabase.from("lineups").select("*").eq("lineup_date", date).limit(1);
    if (existing && existing[0]) return existing[0];
    const { data: created, error } = await supabase
      .from("lineups")
      .insert({ lineup_date: date, updated_by: myId })
      .select()
      .single();
    if (error) {
      setSaveError(
        "Impossible de créer l'alignement de cette journée. Ta session a probablement expiré — reconnecte-toi."
      );
      return null;
    }
    return created;
  }

  async function ensureRosterUnits(lineupId: string, existing: LineupUnit[]): Promise<LineupUnit[]> {
    const missing = ROSTER_TEMPLATE.filter((t) => !existing.some((u) => u.unit_label === t.label));
    if (missing.length === 0) return existing;
    const inserts = missing.map((t, i) => ({
      lineup_id: lineupId,
      unit_type: t.unitType,
      unit_label: t.label,
      color_group: null,
      unit_order: -100 + i,
      player_ids: [],
    }));
    const { data: created } = await supabase.from("lineup_units").insert(inserts).select();
    return [...existing, ...(created ?? [])];
  }

  async function load() {
    setLoading(true);
    const [{ data: pls }, { data: gm }, { data: abs }, { data: evts }, l] = await Promise.all([
      // On charge tout l'effectif actif (réguliers + remplaçants) ; le tri entre
      // les deux se fait à l'affichage, selon qu'on prépare un match ou une pratique.
      supabase.from("players").select("*").eq("active", true).order("jersey_number"),
      supabase.from("games").select("*").eq("game_date", date).maybeSingle(),
      supabase.from("absences").select("*").eq("absence_date", date),
      supabase.from("schedule_events").select("*").eq("event_date", date).order("start_time"),
      ensureLineup(),
    ]);
    setPlayers(pls ?? []);
    setGame(gm ?? null);
    setAbsences(abs ?? []);
    setEvents(evts ?? []);
    setLineup(l);
    if (!l) {
      setLoading(false);
      return;
    }
    const { data: u } = await supabase.from("lineup_units").select("*").eq("lineup_id", l.id).order("unit_order");
    let withRoster = await ensureRosterUnits(l.id, u ?? []);

    // Nettoyage : un alignement de match ne doit porter aucun groupe de couleur.
    // Il peut en rester d'une réplication faite avant cette règle, ou d'une date
    // devenue jour de match après coup.
    if (gm) {
      const stale = withRoster.filter((x) => x.color_group !== null);
      if (stale.length > 0) {
        await Promise.all(stale.map((x) => supabase.from("lineup_units").delete().eq("id", x.id)));
        withRoster = withRoster.filter((x) => x.color_group === null);
      }
    }

    applyUnits(withRoster);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    if (!autoPrint || loading || autoPrinted.current) return;
    autoPrinted.current = true;
    printWithOrientation("portrait", "0");
  }, [autoPrint, loading]);

  function rosterUnit(label: string) {
    return unitsRef.current.find((u) => u.unit_label === label) ?? null;
  }

  async function setRosterSlot(label: string, slotCount: number, index: number, playerId: string) {
    const u = rosterUnit(label);
    if (!u) return;
    const current = [...u.player_ids];
    while (current.length < slotCount) current.push("");
    current[index] = playerId;
    applyUnits(unitsRef.current.map((x) => (x.id === u.id ? { ...x, player_ids: current } : x)));
    const saved = await persistUnit(u.id, current);
    // Si la base a compacté le tableau, l'état local doit refléter ce qui est
    // réellement stocké, sinon la prochaine écriture repartirait d'un tableau
    // qui n'existe plus.
    if (saved && saved.length !== current.length) {
      applyUnits(unitsRef.current.map((x) => (x.id === u.id ? { ...x, player_ids: saved } : x)));
    }
  }

  /**
   * Écrit les joueurs d'une unité et VÉRIFIE le résultat.
   *
   * L'erreur était avalée jusqu'ici, ce qui masquait le vrai problème :
   * player_ids était de type uuid[] et rejetait la chaîne vide utilisée pour
   * une case libre, donc les panneaux incomplets (les attaquants, jamais à
   * 10/10) ne s'enregistraient jamais.
   *
   * migration_017.sql passe la colonne en text[]. Tant qu'elle n'est pas
   * appliquée, on retombe sur une écriture compactée : l'alignement est
   * sauvegardé, au prix de la fermeture des cases vides intercalées.
   * Retourne le tableau réellement enregistré, ou null en cas d'échec.
   */
  // Qui a touché l'alignement en dernier — visible à l'entraîneur-chef
  // seulement (voir l'en-tête plus bas), jamais sur l'export imprimé ni la
  // vue TV : ces deux-là n'affichent que le contenu de l'alignement.
  async function touchLineup() {
    if (!lineup || !myId || lineup.updated_by === myId) return;
    setLineup({ ...lineup, updated_by: myId });
    await supabase.from("lineups").update({ updated_by: myId }).eq("id", lineup.id);
  }

  async function persistUnit(unitId: string, ids: string[]): Promise<string[] | null> {
    touchLineup();
    const { error } = await supabase.from("lineup_units").update({ player_ids: ids }).eq("id", unitId);
    if (!error) {
      setSaveError(null);
      return ids;
    }
    if (error.message.includes("invalid input syntax for type uuid")) {
      const compact = ids.filter(Boolean);
      const retry = await supabase.from("lineup_units").update({ player_ids: compact }).eq("id", unitId);
      if (!retry.error) {
        setSaveError(
          "Enregistré, mais les cases vides ont été refermées. Exécute supabase/migration_017.sql pour les conserver."
        );
        return compact;
      }
    }
    setSaveError(`Échec de l'enregistrement : ${error.message}`);
    return null;
  }

  /** Réécrit tout l'alignement en base et confirme l'enregistrement. */
  async function saveAll() {
    setSavingAll(true);
    await Promise.all(unitsRef.current.map((u) => persistUnit(u.id, u.player_ids)));
    setSavingAll(false);
    setSavedAt(new Date());
  }

  /**
   * Déplace un joueur d'une case à l'autre par glisser-déposer. Si la case
   * d'arrivée est occupée, les deux joueurs sont échangés plutôt qu'écrasés —
   * c'est le comportement attendu quand on réorganise un alignement.
   * Les patineurs (attaquants et défenseurs) sont interchangeables — il arrive
   * de faire jouer un défenseur à l'attaque. Seuls les gardiens restent à part.
   */
  async function moveSlot(from: { label: string; index: number }, to: { label: string; index: number }) {
    if (from.label === to.label && from.index === to.index) return;
    const fromUnit = rosterUnit(from.label);
    const toUnit = rosterUnit(to.label);
    if (!fromUnit || !toUnit) return;

    const capacity = (label: string) => ROSTER_TEMPLATE.find((t) => t.label === label)?.slots ?? 0;
    const padded = (ids: string[], n: number) => {
      const a = [...ids];
      while (a.length < n) a.push("");
      return a;
    };

    if (fromUnit.id === toUnit.id) {
      const arr = padded(fromUnit.player_ids, capacity(from.label));
      [arr[from.index], arr[to.index]] = [arr[to.index], arr[from.index]];
      applyUnits(unitsRef.current.map((u) => (u.id === fromUnit.id ? { ...u, player_ids: arr } : u)));
      await persistUnit(fromUnit.id, arr);
      return;
    }

    const a = padded(fromUnit.player_ids, capacity(from.label));
    const b = padded(toUnit.player_ids, capacity(to.label));
    const moved = a[from.index];
    a[from.index] = b[to.index];
    b[to.index] = moved;
    applyUnits(
      unitsRef.current.map((u) =>
        u.id === fromUnit.id ? { ...u, player_ids: a } : u.id === toUnit.id ? { ...u, player_ids: b } : u
      )
    );
    await Promise.all([persistUnit(fromUnit.id, a), persistUnit(toUnit.id, b)]);
  }

  /**
   * Joueurs qui ratent le match. Enregistré dans la table des absences, avec la
   * date du match : la fiche du joueur compte comme « match raté » toute absence
   * blessure/suspension tombant une journée de match.
   */
  async function addAbsent(playerId: string, reason: AbsenceReason = "blesse") {
    if (!playerId || absences.some((a) => a.player_id === playerId)) return;
    const { data } = await supabase
      .from("absences")
      .upsert({ player_id: playerId, absence_date: date, reason }, { onConflict: "player_id,absence_date" })
      .select()
      .single();
    if (data) setAbsences([...absences, data]);
    setAddAbsentId("");
  }

  async function updateAbsentReason(absenceId: string, reason: AbsenceReason) {
    setAbsences(absences.map((a) => (a.id === absenceId ? { ...a, reason } : a)));
    await supabase.from("absences").update({ reason }).eq("id", absenceId);
  }

  async function removeAbsent(absenceId: string) {
    setAbsences(absences.filter((a) => a.id !== absenceId));
    await supabase.from("absences").delete().eq("id", absenceId);
  }

  /** Cinq partant — conservé dans une unité d'alignement dédiée. */
  function starterIds(): string[] {
    return unitsRef.current.find((u) => u.unit_label === STARTERS_LABEL)?.player_ids ?? [];
  }

  async function toggleStarter(playerId: string) {
    if (!lineup) return;
    const unit = unitsRef.current.find((u) => u.unit_label === STARTERS_LABEL) ?? null;
    const current = unit?.player_ids ?? [];
    const next = current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId];

    if (unit) {
      applyUnits(unitsRef.current.map((u) => (u.id === unit.id ? { ...u, player_ids: next } : u)));
      await persistUnit(unit.id, next);
    } else {
      const { data: created } = await supabase
        .from("lineup_units")
        .insert({
          lineup_id: lineup.id,
          unit_type: "forward_line",
          unit_label: STARTERS_LABEL,
          color_group: null,
          unit_order: -50,
          player_ids: next,
        })
        .select()
        .single();
      // Après l'await : on repart de la ref, pas de l'instantané du rendu.
      if (created) applyUnits([...unitsRef.current, created]);
    }
  }

  function comboUnitsFor(category: "F" | "D") {
    const { unitType, prefix } = GROUPING[category];
    return unitsRef.current.filter((u) => u.unit_type === unitType && u.unit_label.startsWith(`${prefix} `));
  }

  function playerGroupColor(playerId: string, category: "F" | "D"): "gris" | "jaune" | null {
    const combo = comboUnitsFor(category).find((u) => u.player_ids.includes(playerId));
    return (combo?.color_group as "gris" | "jaune" | undefined) ?? null;
  }

  async function cyclePlayerColor(playerId: string, category: "F" | "D") {
    if (!lineup) return;
    touchLineup();
    const { unitType, prefix, capacity } = GROUPING[category];
    const combos = comboUnitsFor(category);
    const currentUnit = combos.find((u) => u.player_ids.includes(playerId));
    const currentColor = (currentUnit?.color_group as "gris" | "jaune" | undefined) ?? null;
    const currentIdx = CYCLE.indexOf(currentColor);
    const nextColor = CYCLE[(currentIdx + 1) % CYCLE.length];

    // Met à jour l'état local directement (comme setRosterSlot) plutôt que de
    // tout recharger depuis la base : un load() complet ici pourrait écraser
    // une sélection de joueur (setRosterSlot) pas encore confirmée en base.
    let nextUnits = unitsRef.current;

    // Retire le joueur de son groupe actuel (supprime le groupe s'il devient vide).
    if (currentUnit) {
      const remaining = currentUnit.player_ids.filter((id) => id !== playerId);
      if (remaining.length === 0) {
        await supabase.from("lineup_units").delete().eq("id", currentUnit.id);
        nextUnits = nextUnits.filter((u) => u.id !== currentUnit.id);
      } else {
        await supabase.from("lineup_units").update({ player_ids: remaining }).eq("id", currentUnit.id);
        nextUnits = nextUnits.map((u) => (u.id === currentUnit.id ? { ...u, player_ids: remaining } : u));
      }
    }

    if (nextColor) {
      const targetPool = combos.filter((u) => u.id !== currentUnit?.id && u.color_group === nextColor);
      const withRoom = targetPool.find((u) => u.player_ids.length < capacity);
      if (withRoom) {
        const newIds = [...withRoom.player_ids, playerId];
        await supabase.from("lineup_units").update({ player_ids: newIds }).eq("id", withRoom.id);
        nextUnits = nextUnits.map((u) => (u.id === withRoom.id ? { ...u, player_ids: newIds } : u));
      } else {
        const existingCount = combos.filter((u) => u.color_group === nextColor).length;
        const { data: created } = await supabase
          .from("lineup_units")
          .insert({
            lineup_id: lineup.id,
            unit_type: unitType,
            unit_label: `${prefix} ${nextColor === "gris" ? "Gris" : "Jaune"} ${existingCount + 1}`,
            color_group: nextColor,
            unit_order: unitsRef.current.length,
            player_ids: [playerId],
          })
          .select()
          .single();
        if (created) nextUnits = [...nextUnits, created];
      }
    }
    applyUnits(nextUnits);
  }

  async function replicateLast() {
    if (!lineup) return;
    touchLineup();
    setReplicating(true);
    const { data: previous } = await supabase
      .from("lineups")
      .select("*")
      .lt("lineup_date", date)
      .order("lineup_date", { ascending: false })
      .limit(1);
    const prevLineup = previous?.[0];
    if (!prevLineup) {
      setReplicating(false);
      return;
    }
    const { data: prevUnits } = await supabase.from("lineup_units").select("*").eq("lineup_id", prevLineup.id).order("unit_order");

    await Promise.all(unitsRef.current.map((u) => supabase.from("lineup_units").delete().eq("id", u.id)));

    // Un jour de match, on ne recopie que l'effectif : les trios/duos de couleur
    // d'une pratique n'ont pas de sens ici (l'équipe n'est pas divisée en camps).
    const source = game
      ? (prevUnits ?? []).filter((u) => u.unit_label.endsWith("(effectif)"))
      : (prevUnits ?? []);

    const inserts = source.map((u) => ({
      lineup_id: lineup.id,
      unit_type: u.unit_type,
      unit_label: u.unit_label,
      color_group: game ? null : u.color_group,
      unit_order: u.unit_order,
      player_ids: u.player_ids,
    }));
    const { data: newUnits } = await supabase.from("lineup_units").insert(inserts).select();
    applyUnits(newUnits ?? []);
    setReplicating(false);
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  // Congé ou pédago : pas d'activité, donc pas d'alignement à bâtir. La page
  // est atteignable par son adresse — on referme la porte ici aussi.
  if (isDayOff(events)) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/50 px-6 py-12 text-center space-y-2">
        <div className="text-4xl">🌴</div>
        <h1 className="text-xl font-bold text-white">Journée de congé</h1>
        <p className="text-sm text-slate-400">
          Aucune activité ce jour-là : il n&apos;y a pas d&apos;alignement à préparer.
        </p>
        <Link href={`/jour/${date}`} className="btn-secondary inline-flex mt-2">
          ← Retour à la journée
        </Link>
      </div>
    );
  }

  const byId = new Map(players.map((p) => [p.id, p]));
  const trios = comboUnitsFor("F").sort((a, b) => a.unit_label.localeCompare(b.unit_label));
  const duos = comboUnitsFor("D").sort((a, b) => a.unit_label.localeCompare(b.unit_label));

  // Les groupes de couleur (gris / jaune) servent à opposer deux camps pendant
  // une pratique. Un jour de match, l'équipe joue contre l'adversaire : il n'y
  // a donc pas de camps à former, et les couleurs sont désactivées.
  const isGameDay = !!game;
  const opponentTeam = game ? findTeamByOpponent(game.opponent) : undefined;

  // Uniforme réel porté ce match : gris+or à domicile, blanc+or à l'étranger.
  const matchSkin: JerseySkin | null = isGameDay ? (game!.is_home ? "local" : "visiteur") : null;

  // Les remplaçants ne sont proposés qu'en match, via la fenêtre « Remplaçant ».
  // Delarosbil bascule d'un groupe à l'autre : il s'entraîne avec l'équipe, donc
  // il fait partie de l'effectif régulier aux pratiques, mais reste un rappel
  // les jours de match.
  const regulars = players.filter(
    (p) => !p.is_call_up || (!isGameDay && p.id === ALIGNMENT_CALL_UP_EXCEPTION_ID)
  );
  const callUps = isGameDay ? players.filter((p) => p.is_call_up) : [];

  // Joueurs signalés ce jour-là : id → libellé. Sert à les marquer partout
  // (menus, chandails, cinq partant) plutôt qu'à les cacher. Un « sans
  // contact » reste dans l'alignement : il a patiné.
  const absentLabels: Record<string, string> = Object.fromEntries(
    absences.map((a) => {
      const reason = a.reason ?? "blesse";
      const emoji = REASON_EMOJI[reason] ?? "";
      const label = isGameDay
        ? GAME_MISSED_LABEL[reason as "blesse" | "suspendu"] ?? ABSENCE_REASON_LABEL[reason]
        : ABSENCE_REASON_LABEL[reason];
      return [a.player_id, `${emoji} ${label}`.trim()];
    })
  );
  // Un statut « présent » (sans contact) ne doit pas teinter la case en rouge
  // comme une absence : le joueur est bien là.
  const presentStatusIds = new Set(absences.filter((a) => isPresentStatus(a.reason)).map((a) => a.player_id));

  const starters = starterIds();
  const starterPlayers = starters.map((id) => byId.get(id)).filter((p): p is Player => !!p);

  /** L'effectif du jour tel qu'affiché : la grille porte la position détaillée. */
  const rosterGrids: RosterGrid[] = ROSTER_TEMPLATE.map((t) => ({
    position: t.position,
    playerIds: rosterUnit(t.label)?.player_ids ?? [],
  }));
  const detailedPositionOf = (playerId: string) => detailedPosition(playerId, rosterGrids);

  const startingSkaters = starterPlayers
    .filter((p) => p.position !== "G")
    .sort(byAnnounceOrder(rosterGrids));
  const startingGoalies = starterPlayers.filter((p) => p.position === "G");

  const filledCount = (label: string) => (rosterUnit(label)?.player_ids.filter(Boolean).length ?? 0);
  const totalFilled = ROSTER_TEMPLATE.reduce((n, t) => n + filledCount(t.label), 0);
  const skatersFilled = ROSTER_TEMPLATE.filter((t) => t.position !== "G").reduce(
    (n, t) => n + filledCount(t.label),
    0
  );
  const skaterLimit = isGameDay ? DRESSED_SKATERS : PRACTICE_SKATERS;
  const tooManySkaters = skatersFilled > skaterLimit;

  return (
    <>
    <div className="space-y-6 print:hidden">
      {/* ---- Bandeau d'en-tête ---- */}
      <section className="relative overflow-hidden rounded-2xl border border-gold-400/25 bg-gradient-to-br from-ink-800/90 via-ink-900/90 to-black/90">
        <span
          className="pointer-events-none select-none absolute -right-4 top-1/2 -translate-y-1/2 text-[7rem] font-black text-white/[0.04] uppercase tracking-tighter leading-none"
          aria-hidden
        >
          {isGameDay ? "Match" : "Pratique"}
        </span>
        <div className="relative p-5 sm:p-6 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            {isGameDay && opponentTeam && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={opponentTeam.logo}
                alt={opponentTeam.name}
                className="h-16 w-16 shrink-0 rounded-full bg-white object-contain p-1.5 ring-2 ring-gold-400/50"
              />
            )}
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-gold-400">
                {isGameDay ? `Alignement de match — ${matchupLabel(game!, opponentTeam?.name)}` : "Alignement de pratique"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black capitalize text-white leading-tight">
                {format(parseISO(date), "EEEE d MMMM", { locale: fr })}
              </h1>
              <p className="text-slate-300 text-sm mt-0.5">
                {isGameDay
                  ? "Sélectionne l'effectif habillé pour le match."
                  : "Sélectionne l'effectif, puis clique un chandail pour former les trios et duos."}
              </p>
              <p className="text-slate-400 text-xs mt-1">
                ↔ Glisse un chandail sur un autre pour déplacer ou échanger deux joueurs.
              </p>
              <p className="text-slate-500 text-xs mt-0.5">
                Chaque changement est enregistré automatiquement — le bouton Enregistrer sert à confirmer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Jauge de remplissage — repère rapide façon écran d'équipe. */}
            <div className="min-w-[9rem]">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Effectif</span>
                <span className="text-sm font-black text-white tabular-nums">
                  {totalFilled}
                  <span className="text-slate-500">/{skaterLimit + 2}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    tooManySkaters
                      ? "bg-gradient-to-r from-red-600 to-red-400"
                      : "bg-gradient-to-r from-gold-600 to-gold-400"
                  }`}
                  style={{ width: `${Math.min(100, Math.round((totalFilled / (skaterLimit + 2)) * 100))}%` }}
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {savedAt && !savingAll && !saveError && (
                <span className="text-xs font-bold text-green-400">
                  ✓ Enregistré à {format(savedAt, "HH:mm:ss")}
                </span>
              )}
              {/* Traçabilité — entraîneur-chef seulement, jamais sur l'export
                  imprimé (print:hidden couvre toute cette section) ni la vue TV
                  (TvDayBoard ne reçoit jamais cette donnée). */}
              {isHeadCoach && authorLabel(lineup?.updated_by ?? null) && (
                <span className="text-xs text-slate-400" title="Dernière modification de cet alignement">
                  Modifié par {authorLabel(lineup?.updated_by ?? null)}
                </span>
              )}
              <button className="btn-secondary" onClick={replicateLast} disabled={replicating}>
                {replicating ? "Copie..." : "↻ Répliquer"}
              </button>
              <button className="btn-secondary" onClick={() => setEditing("horaire")}>
                🕐 Horaire
              </button>
              {isGameDay && (
                <button className="btn-secondary" onClick={() => setEditing("plan")}>
                  📋 Plan de match
                </button>
              )}
              {isGameDay && (
                <Link href={`/resultats/${game!.id}`} className="btn-secondary">
                  📄 Feuille de match
                </Link>
              )}
              <button className="btn" onClick={saveAll} disabled={savingAll}>
                {savingAll ? "Enregistrement..." : "💾 Enregistrer"}
              </button>
              <button
                className="btn-dark"
                onClick={() => printWithOrientation("portrait", "0")}
                title="Dans la boîte d'impression de Chrome, mets « Marges : Aucune » pour supprimer l'en-tête et le pied de page du navigateur."
              >
                🖨️ Exporter
              </button>
              <Link href={`/jour/${date}`} className="btn-dark">
                ← Journée
              </Link>
            </div>
          </div>
        </div>
      </section>

      {tooManySkaters && (
        <p className="rounded-xl border border-red-400/50 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100">
          ⚠ {skatersFilled} patineurs sélectionnés.{" "}
          {isGameDay
            ? `L'équipe habille ${DRESSED_TOTAL} joueurs : ${DRESSED_SKATERS} patineurs (10 attaquants + 6 défenseurs, ou 9 + 7) et 2 gardiens.`
            : `À l'entraînement, ${PRACTICE_SKATERS} patineurs au maximum.`}
        </p>
      )}

      {saveError && (
        <p className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">
          ⚠ {saveError}
        </p>
      )}

      {/* ---- Effectif (+ cinq partant à droite les jours de match) ---- */}
      {/*
        La colonne de droite (cinq partant / blessés) doit garder une largeur
        fixe peu importe le jour : sans gabarit de colonnes explicite, un
        élément placé en xl:col-start-2 crée sa propre colonne implicite,
        aussi large que son contenu — c'est ce qui la faisait déborder sur la
        moitié de la page les jours de pratique.
      */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(10rem,1fr)]">
          {ROSTER_TEMPLATE.map((t) => {
            const u = rosterUnit(t.label);
            const slotValues = Array.from({ length: t.slots }, (_, i) => u?.player_ids[i] ?? "");
            const allSelected = new Set(units.filter((x) => x.unit_label.endsWith("(effectif)")).flatMap((x) => x.player_ids));
            const filled = filledCount(t.label);
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
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                      filled === t.slots ? "bg-gold-500 text-ink-900" : "bg-white/10 text-slate-300"
                    }`}
                  >
                    {filled}/{t.slots}
                  </span>
                </header>
                <div className={`grid ${t.gridCols} gap-x-4 gap-y-6 p-4 pt-5 justify-items-center`}>
                  {slotValues.map((value, i) => {
                    // Un défenseur peut jouer à l'attaque (et l'inverse) : les
                    // cases de patineurs acceptent les deux positions. Les
                    // gardiens restent isolés.
                    const eligible = (p: Player) =>
                      t.position === "G" ? p.position === "G" : p.position === "F" || p.position === "D";
                    const options = regulars.filter(
                      (p) => (p.id === value || !allSelected.has(p.id)) && eligible(p)
                    );
                    const groupable = !isGameDay && t.position !== "G" && !!value;
                    // Les patineurs circulent librement entre le panneau des
                    // attaquants et celui des défenseurs ; les gardiens non.
                    const sameFamily =
                      dragFrom &&
                      (dragFrom.position === "G" || t.position === "G"
                        ? dragFrom.position === t.position
                        : true);
                    const dropState: "idle" | "source" | "target" | "blocked" = !dragFrom
                      ? "idle"
                      : dragFrom.label === t.label && dragFrom.index === i
                        ? "source"
                        : sameFamily
                          ? "target"
                          : "blocked";
                    return (
                      <JerseySlot
                        key={i}
                        value={value}
                        onChange={(playerId) => setRosterSlot(t.label, t.slots, i, playerId)}
                        options={options}
                        callUpOptions={callUps.filter((p) => eligible(p) && (p.id === value || !allSelected.has(p.id)))}
                        expectedPosition={t.position}
                        absentLabels={absentLabels}
                        presentStatusIds={presentStatusIds}
                        color={t.color}
                        ring={groupable ? playerGroupColor(value, t.position as "F" | "D") : matchSkin}
                        onRingClick={groupable ? () => cyclePlayerColor(value, t.position as "F" | "D") : undefined}
                        starting={starters.includes(value)}
                        onStartingClick={isGameDay && value ? () => toggleStarter(value) : undefined}
                        dropState={dropState}
                        onDragStartSlot={() => setDragFrom({ label: t.label, index: i, position: t.position })}
                        onDragEndSlot={() => setDragFrom(null)}
                        onDropSlot={() => {
                          if (dragFrom) moveSlot(dragFrom, { label: t.label, index: i });
                          setDragFrom(null);
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* ---- Cinq partant ---- */}
        {isGameDay && (
          <section className="rounded-2xl border border-gold-400/30 bg-black/60 backdrop-blur-sm overflow-hidden self-start xl:sticky xl:top-4">
            <header className="flex items-center justify-between gap-2 border-b border-gold-400/25 bg-gold-500/10 px-4 py-2.5">
              <span className="text-xs font-black uppercase tracking-widest text-gold-400">★ Alignement partant</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                  startingSkaters.length === STARTER_SKATERS && startingGoalies.length === 1
                    ? "bg-gold-500 text-ink-900"
                    : "bg-white/10 text-slate-300"
                }`}
              >
                {startingSkaters.length}/{STARTER_SKATERS}
              </span>
            </header>

            <div className="p-3 space-y-3">
              <p className="text-[11px] text-slate-400 leading-snug">
                Clique l&apos;étoile ★ sur un chandail pour faire débuter le joueur.
                {startingSkaters.length === 0 && startingGoalies.length === 0 &&
                  " Le joueur doit d'abord être placé dans l'effectif ci-contre."}
              </p>
              {(() => {
                const manquePatineurs = STARTER_SKATERS - startingSkaters.length;
                const manqueGardien = 1 - startingGoalies.length;
                if (manquePatineurs <= 0 && manqueGardien <= 0) {
                  return (
                    <p className="rounded-lg bg-green-500/15 border border-green-400/40 px-2 py-1.5 text-[11px] font-bold text-green-300">
                      ✓ Alignement partant complet.
                    </p>
                  );
                }
                return (
                  <p className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-[11px] font-semibold text-slate-300">
                    Il manque{manquePatineurs > 0 ? ` ${manquePatineurs} patineur(s)` : ""}
                    {manquePatineurs > 0 && manqueGardien > 0 ? " et" : ""}
                    {manqueGardien > 0 ? " le gardien" : ""}.
                  </p>
                );
              })()}
              {starterPlayers.some((p) => absentLabels[p.id]) && (
                <p className="rounded-lg bg-red-500/15 border border-red-400/40 px-2 py-1.5 text-[11px] font-bold text-red-200">
                  ⚠ Un partant est déclaré blessé ou suspendu.
                </p>
              )}

              <div className="space-y-1.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Patineurs</div>
                {startingSkaters.length === 0 ? (
                  <p className="text-xs text-slate-500 italic px-1">Aucun partant choisi.</p>
                ) : (
                  startingSkaters.map((p) => (
                    <StarterRow key={p.id} player={p} onRemove={() => toggleStarter(p.id)} />
                  ))
                )}
                {startingSkaters.length > STARTER_SKATERS && (
                  <p className="text-[11px] font-bold text-amber-300 px-1">
                    ⚠ {startingSkaters.length} patineurs choisis — il n&apos;en faut que {STARTER_SKATERS}.
                  </p>
                )}
              </div>

              <div className="space-y-1.5 border-t border-white/10 pt-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Gardien</div>
                {startingGoalies.length === 0 ? (
                  <p className="text-xs text-slate-500 italic px-1">Aucun gardien choisi.</p>
                ) : (
                  startingGoalies.map((p) => (
                    <StarterRow key={p.id} player={p} onRemove={() => toggleStarter(p.id)} />
                  ))
                )}
                {startingGoalies.length > 1 && (
                  <p className="text-[11px] font-bold text-amber-300 px-1">⚠ Un seul gardien peut partir.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ---- État des joueurs : blessés, suspendus, sans contact ---- */}
        {(
          <section className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur-sm overflow-hidden self-start xl:col-start-2">
            <header className="border-b border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-red-300">
              🩹 {isGameDay ? "Blessés et suspendus" : "Blessés et sans contact"}
              {absences.length > 0 ? ` (${absences.length})` : ""}
            </header>
            <div className="p-3 space-y-2">
              <select
                className="input text-xs"
                value={addAbsentId}
                onChange={(e) => addAbsent(e.target.value)}
              >
                <option value="">
                  {isGameDay ? "— Ajouter un joueur qui rate le match —" : "— Ajouter un joueur blessé ou sans contact —"}
                </option>
                {players
                  .filter((p) => !p.is_call_up && !absences.some((a) => a.player_id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.jersey_number ? `#${p.jersey_number} ` : ""}
                      {p.full_name}
                    </option>
                  ))}
              </select>

              {absences.length === 0 ? (
                <p className="text-[11px] text-slate-500 px-1">Tout le monde est disponible.</p>
              ) : (
                absences.map((a) => {
                  const p = byId.get(a.player_id);
                  return (
                    // Nom sur sa propre ligne : la classe .input impose
                    // width:100% et l'emporte sur w-auto, donc un select placé
                    // à côté du nom l'écrasait à zéro pixel de large.
                    <div key={a.id} className="rounded-lg bg-white/[0.06] px-2 py-1.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 text-xs font-black text-white truncate">
                          {p?.jersey_number ? `#${p.jersey_number} ` : ""}
                          {p ? p.full_name : "Joueur inconnu"}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAbsent(a.id)}
                          title="Retirer — le joueur redevient disponible"
                          className="shrink-0 text-slate-400 hover:text-red-400 text-sm leading-none px-1"
                        >
                          ✕
                        </button>
                      </div>
                      <select
                        className="input text-[11px] py-0.5"
                        value={a.reason ?? "blesse"}
                        onChange={(e) => updateAbsentReason(a.id, e.target.value as AbsenceReason)}
                      >
                        {(isGameDay ? GAME_DAY_REASONS : PRACTICE_STATUS_REASONS).map((r) => (
                          <option key={r} value={r}>
                            {isGameDay ? GAME_MISSED_LABEL[r as "blesse" | "suspendu"] : ABSENCE_REASON_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
              <p className="text-[11px] text-slate-500 px-1 pt-1">
                {isGameDay
                  ? "Comptabilisé comme match raté dans la fiche du joueur."
                  : "Un joueur sans contact reste dans l'alignement — il a patiné. Les deux états alimentent l'onglet Blessures."}
              </p>
            </div>
          </section>
        )}
      </div>

      {/* ---- Trios et duos : pratiques seulement ---- */}
      {isGameDay ? (
        <p className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-300">
          🥅 <strong className="text-white">Jour de match.</strong> Les groupes de couleur servent à opposer deux
          camps à l&apos;entraînement — ils ne s&apos;appliquent pas ici, l&apos;équipe joue contre{" "}
          {opponentTeam?.name ?? game!.opponent}.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: "Trios d'attaquants", list: trios, empty: "Clique un chandail d'attaquant ci-dessus pour commencer un trio." },
            { title: "Duos de défenseurs", list: duos, empty: "Clique un chandail de défenseur ci-dessus pour commencer un duo." },
          ].map((section) => (
            <section key={section.title} className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur-sm overflow-hidden">
              <header className="border-b border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-gold-400">
                {section.title}
              </header>
              <div className="p-3 space-y-2">
                {section.list.length === 0 ? (
                  <p className="text-xs text-slate-400 px-1 py-2">{section.empty}</p>
                ) : (
                  section.list.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 rounded-lg bg-white/[0.04] pl-0 pr-3 py-2 overflow-hidden"
                    >
                      {/* Liseré de couleur : identifie le camp d'un coup d'œil. */}
                      <span
                        className={`w-1.5 self-stretch shrink-0 ${u.color_group === "gris" ? "bg-slate-400" : "bg-gold-400"}`}
                        aria-hidden
                      />
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 shrink-0 w-20">
                        {u.unit_label}
                      </span>
                      <span className="text-sm font-bold text-white truncate">
                        {u.player_ids.map((id) => (byId.get(id) ? lastName(byId.get(id)!.full_name) : "?")).join(" · ")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>

    {editing && (
      <Modal onClose={() => setEditing(null)}>
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white">
            {editing === "plan" ? "Plan de match — 4 points clés" : "Horaire de la journée"}
          </h2>
          <div className="card">
            {editing === "plan" && game ? (
              <GamePlanEditor
                game={game}
                onSaved={() => {
                  setEditing(null);
                  load();
                }}
              />
            ) : (
              <DayScheduleEditor date={date} isGameDay={isGameDay} onChanged={load} />
            )}
          </div>
          <button className="btn-dark" onClick={() => setEditing(null)}>
            Fermer
          </button>
        </div>
      </Modal>
    )}

    {/* ---- Feuille imprimable (portrait) ----
        Les sections sont empilées sur toute la largeur plutôt que côte à côte :
        en portrait, trois colonnes 3fr/2fr/1fr laisseraient 31 mm par joueur et
        forceraient un corps minuscule. Empilées, chaque grille garde EXACTEMENT
        la disposition de l'écran (attaquants 3 de front = un trio par ligne,
        défenseurs 2 de front = une paire par ligne) avec des caractères lisibles.
        Les cases vides sont conservées : c'est ce qui rend les trios lisibles. */}
    <div className="hidden print:block text-black p-[8mm]">
      <div className="mx-auto max-w-[190mm]">
        <header className="text-center border-b-4 border-black pb-2 mb-3">
          <h1 className="text-[24pt] font-black uppercase leading-none tracking-tight">As de Québec M17 AAA</h1>
          <p className="text-[13pt] font-bold uppercase tracking-wide mt-1">
            {isGameDay ? matchupLabel(game!, opponentTeam?.name) : "Alignement de pratique"}
          </p>
          <p className="text-[11pt] font-semibold capitalize mt-0.5">
            {format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}
            {game?.location ? ` — ${game.location}` : ""}
          </p>
        </header>

        {ROSTER_TEMPLATE.map((t) => {
          const ids = rosterUnit(t.label)?.player_ids ?? [];
          const all = Array.from({ length: t.slots }, (_, i) => byId.get(ids[i] ?? "") ?? null);
          const filled = all.filter(Boolean).length;
          // On coupe les cases vides de la FIN : jouer à 9 attaquants ne doit pas
          // laisser une rangée vide qui repousse le plan de match en 2e page.
          // Les trous intercalés restent, eux : ils portent le découpage des trios.
          const lastUsed = all.reduce((last, p, i) => (p ? i : last), -1);
          const slots = all.slice(0, lastUsed + 1);
          return (
            <section key={t.label} className="mb-3">
              <h2 className="text-[13pt] font-black uppercase tracking-widest border-b-2 border-black pb-0.5 mb-2">
                {t.short} <span className="font-bold">({filled})</span>
              </h2>
              {/* Attaquants et défenseurs gardent la disposition de l'écran
                  (3 et 2 de front). Les gardiens passent à 2 de front : leur
                  colonne unique est étroite à l'écran, mais deviendrait une
                  case de 190 mm de large sur la feuille. */}
              <div className={`grid ${t.position === "G" ? "grid-cols-2" : t.gridCols} gap-1.5`}>
                {slots.map((p, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded border-2 px-2 py-1 ${
                      p ? "border-black" : "border-dashed border-gray-400"
                    }`}
                  >
                    <span
                      className={`w-9 shrink-0 text-center text-[17pt] font-black leading-none ${
                        p ? "" : "text-gray-300"
                      }`}
                    >
                      {p?.jersey_number ?? "–"}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      {p ? (
                        <>
                          <span className="block text-[11pt] font-bold">
                            {p.full_name}
                            {starters.includes(p.id) && <span className="text-[12pt]"> ★</span>}
                          </span>
                          {/* Seule la position hors gabarit est signalée ;
                              le statut de remplaçant n'a pas à figurer sur la
                              feuille remise au banc. */}
                          {p.position !== t.position && (
                            <span className="block text-[8.5pt] font-semibold uppercase tracking-wide">
                              {p.position === "D" ? "Défenseur" : p.position === "F" ? "Attaquant" : "Gardien"}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="block text-[10pt] italic text-gray-400">libre</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {!isGameDay && (trios.length > 0 || duos.length > 0) && (
          <section className="mb-3">
            <h2 className="text-[13pt] font-black uppercase tracking-widest border-b-2 border-black pb-0.5 mb-2">
              Trios et duos
            </h2>
            <ul className="text-[11pt] space-y-1">
              {[...trios, ...duos].map((u) => (
                <li key={u.id}>
                  <span className="font-black">{u.unit_label} :</span>{" "}
                  {u.player_ids.map((id) => (byId.get(id) ? lastName(byId.get(id)!.full_name) : "?")).join(" — ")}
                </li>
              ))}
            </ul>
          </section>
        )}

        {isGameDay && absences.length > 0 && (
          <section className="mb-3">
            <h2 className="text-[13pt] font-black uppercase tracking-widest border-b-2 border-black pb-0.5 mb-2">
              Blessés et suspendus
            </h2>
            <ul className="text-[11pt] space-y-1">
              {absences.map((a) => {
                const p = byId.get(a.player_id);
                return (
                  <li key={a.id} className="font-semibold">
                    #{p?.jersey_number ?? "–"} {p?.full_name ?? "?"} —{" "}
                    {GAME_MISSED_LABEL[(a.reason ?? "blesse") as "blesse" | "suspendu"]}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 2. Horaire de la journée */}
        {/* Sections vides masquées à l'impression : elles n'apprennent rien et
            repoussent le reste sur une deuxième page. */}
        {(events.length > 0 || game?.bus_departure_time) && (
        <section className="mb-3">
          <h2 className="text-[13pt] font-black uppercase tracking-widest border-b-2 border-black pb-0.5 mb-2">
            Horaire de la journée
          </h2>
          {(
            <ul className="text-[12pt] space-y-1">
              {game?.bus_departure_time && (
                <li className="flex gap-3">
                  <span className="font-black w-16 shrink-0">{game.bus_departure_time.slice(0, 5)}</span>
                  <span className="font-semibold">Départ de l&apos;autobus — Aréna Duberger</span>
                </li>
              )}
              {events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="font-black w-16 shrink-0">{e.start_time ? e.start_time.slice(0, 5) : "—"}</span>
                  <span className="font-semibold">
                    {EVENT_TYPE_LABEL[e.event_type]}
                    {e.title && e.title !== EVENT_TYPE_LABEL[e.event_type] ? ` : ${e.title}` : ""}
                    {e.location && showsLocation(e.event_type) ? ` (${e.location})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        {/* 3. Plan de match — masqué si aucun point n'est saisi. */}
        {isGameDay && [game!.plan_point_1, game!.plan_point_2, game!.plan_point_3, game!.plan_point_4].some((x) => x) && (
          <section>
            <h2 className="text-[13pt] font-black uppercase tracking-widest border-b-2 border-black pb-0.5 mb-2">
              Plan de match
            </h2>
            {(
              <ol className="space-y-1.5">
                {[game!.plan_point_1, game!.plan_point_2, game!.plan_point_3, game!.plan_point_4].map(
                  (point, i) =>
                    point && (
                      <li key={i} className="flex gap-2 items-baseline">
                        <span className="text-[13pt] font-black shrink-0">{i + 1}.</span>
                        <span className="text-[12pt] font-bold uppercase">{point}</span>
                      </li>
                    )
                )}
              </ol>
            )}
          </section>
        )}

        {/* Alignement partant — en fin de feuille, nettement détaché du plan de
            match : un filet et une marge généreuse évitent qu'on le lise comme
            un 5e point du plan. */}
        {isGameDay && starterPlayers.length > 0 && (
          <>
          <div className="mt-8 border-t-2 border-black/30" aria-hidden />
          <section className="mt-6 border-2 border-black rounded">
            <h2 className="bg-black text-white text-[12pt] font-black uppercase tracking-widest px-3 py-1 text-center">
              ★ Alignement partant
            </h2>
            <p className="text-[13pt] font-bold text-center py-2 px-3">
              {/* Annoncé dans l'ordre du hockey : AG, C, AD, DG, DD, G —
                  et non dans l'ordre où les étoiles ont été cliquées. */}
              {startingSkaters
                .map((p) => {
                  const pos = detailedPositionOf(p.id);
                  return `${pos ? `${pos} ` : ""}#${p.jersey_number ?? "–"} ${lastName(p.full_name)}`;
                })
                .join("  ·  ")}
              {startingGoalies.length > 0 && (
                <span className="block text-[11pt] font-semibold mt-1">
                  Gardien : {startingGoalies.map((p) => `#${p.jersey_number ?? "–"} ${lastName(p.full_name)}`).join(", ")}
                </span>
              )}
            </p>
          </section>
          </>
        )}
      </div>
    </div>

    </>
  );
}
