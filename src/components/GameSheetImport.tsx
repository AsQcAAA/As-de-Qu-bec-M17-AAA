"use client";

import { useMemo, useState } from "react";
import { matchPlayer, type ParsedGameSheet, type SheetEvent } from "@/lib/gameSheet";
import { parsePenaltyCode } from "@/lib/penalties";
import { RESULT_LABEL } from "@/lib/gameResults";
import type { GameResult, Player } from "@/lib/types";

/** Une ligne d'aperçu : ce que dit la feuille + le joueur retenu. */
export interface ImportLine {
  jersey: string;
  sheetName: string;
  goals: number;
  assists: number;
  points: number;
  playerId: string | null;
  confidence: "exact" | "probable" | "manuel" | null;
}

/** Un gardien retenu : minutes jouées et buts alloués. */
export interface ImportGoalieLine {
  playerId: string;
  minutes: number;
  goalsAgainst: number;
}

/** Un gardien de la feuille, éditable avant enregistrement. */
interface GoalieRow {
  jersey: string;
  sheetName: string;
  minutes: number;
  goalsAgainst: number;
  player: Player | null;
}

/**
 * Un but de la feuille, avec ses numéros modifiables comme sur le papier :
 * une case = un numéro de chandail, buteur puis passeurs.
 */
interface EditableGoal {
  index: number;
  period: string | null;
  time: string | null;
  scorerJersey: string;
  assist1Jersey: string;
  assist2Jersey: string;
}

export interface ImportDecision {
  result: GameResult | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  lines: ImportLine[];
  goalies: ImportGoalieLine[];
  penalties: { playerId: string | null; jersey: number | null; code: string; period: string | null; time: string | null }[];
  /** Sommaire complet des deux équipes. */
  events: SheetEvent[];
  specialTeams: ParsedGameSheet["specialTeams"];
}

/** Un menu déroulant de numéro de chandail — comme une case de la feuille officielle. */
function JerseySelect({
  value,
  onChange,
  roster,
  emptyLabel,
}: {
  value: string;
  onChange: (jersey: string) => void;
  roster: Player[];
  emptyLabel: string;
}) {
  return (
    <select className="input py-1 w-full" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {roster.map((p) => (
        <option key={p.id} value={String(p.jersey_number)}>
          {p.jersey_number} — {p.full_name}
        </option>
      ))}
    </select>
  );
}

/**
 * Aperçu de ce qui a été lu sur la feuille de match, présenté en pop-up AVANT
 * toute écriture.
 *
 * La feuille officielle peut porter une erreur de saisie du marqueur (un
 * numéro noté pour un autre) — le coach doit pouvoir la corriger lui-même en
 * changeant directement le numéro de la case concernée, exactement comme sur
 * le papier, plutôt que de bricoler des totaux qui ne représentent plus rien
 * de réel. Un premier écran demande simplement s'il y a des corrections à
 * apporter ; « Modifier » ouvre le détail, but par but.
 */
export default function GameSheetImport({
  parsed,
  players,
  onApply,
  onCancel,
  applying,
}: {
  parsed: ParsedGameSheet;
  players: Player[];
  onApply: (decision: ImportDecision) => void;
  onCancel: () => void;
  applying: boolean;
}) {
  // Numéro de chandail → joueur : c'est ce numéro, et rien d'autre, que porte
  // chaque case de la feuille officielle.
  const byJersey = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of players) if (p.jersey_number != null) m.set(String(p.jersey_number), p);
    return m;
  }, [players]);

  const roster = useMemo(
    () =>
      [...players]
        .filter((p) => p.jersey_number != null)
        .sort((a, b) => (a.jersey_number ?? 0) - (b.jersey_number ?? 0)),
    [players]
  );

  const initialGoals: EditableGoal[] = useMemo(
    () =>
      parsed.goals.map((g) => ({
        index: g.index,
        period: g.period,
        time: g.time,
        scorerJersey: g.scorerJersey ?? "",
        assist1Jersey: g.assistJerseys[0] ?? "",
        assist2Jersey: g.assistJerseys[1] ?? "",
      })),
    [parsed]
  );

  const initialGoalies: GoalieRow[] = useMemo(
    () =>
      parsed.goalies.map((g) => {
        const m = matchPlayer(g.sheetName, players);
        return {
          jersey: g.jersey,
          sheetName: g.sheetName,
          minutes: g.minutes,
          goalsAgainst: g.goalsAgainst,
          player: m?.confidence === "exact" ? m.player : null,
        };
      }),
    [parsed, players]
  );

  // "confirm" : demande simplement s'il faut corriger quelque chose.
  // "edit"    : la feuille, but par but, numéros modifiables.
  const [step, setStep] = useState<"confirm" | "edit">("confirm");
  const [goals, setGoals] = useState<EditableGoal[]>(initialGoals);
  const [goalieRows, setGoalieRows] = useState<GoalieRow[]>(initialGoalies);

  function setGoalField(idx: number, field: "scorerJersey" | "assist1Jersey" | "assist2Jersey", jersey: string) {
    setGoals((prev) => prev.map((g, i) => (i === idx ? { ...g, [field]: jersey } : g)));
  }

  function setGoaliePlayerFor(idx: number, playerId: string) {
    const p = players.find((pl) => pl.id === playerId) ?? null;
    setGoalieRows((prev) => prev.map((g, i) => (i === idx ? { ...g, player: p } : g)));
  }

  function setGoalieStatFor(idx: number, field: "minutes" | "goalsAgainst", value: number) {
    const v = Number.isFinite(value) && value >= 0 ? value : 0;
    setGoalieRows((prev) => prev.map((g, i) => (i === idx ? { ...g, [field]: v } : g)));
  }

  // Les buts/passes/points ne sont jamais saisis séparément : ils se
  // recalculent depuis les numéros posés sur chaque but, exactement comme le
  // ferait le marqueur en additionnant les cases de la feuille.
  const lines: ImportLine[] = useMemo(() => {
    const tally = new Map<string, { goals: number; assists: number }>();
    const bump = (jersey: string, kind: "goals" | "assists") => {
      const cur = tally.get(jersey) ?? { goals: 0, assists: 0 };
      cur[kind] += 1;
      tally.set(jersey, cur);
    };
    for (const g of goals) {
      if (g.scorerJersey) bump(g.scorerJersey, "goals");
      if (g.assist1Jersey) bump(g.assist1Jersey, "assists");
      if (g.assist2Jersey) bump(g.assist2Jersey, "assists");
    }
    return [...tally.entries()]
      .map(([jersey, t]) => {
        const player = byJersey.get(jersey);
        return {
          jersey,
          sheetName: player?.full_name ?? `N° ${jersey} (hors effectif)`,
          goals: t.goals,
          assists: t.assists,
          points: t.goals + t.assists,
          playerId: player?.id ?? null,
          confidence: player ? ("exact" as const) : null,
        };
      })
      .sort((a, b) => b.points - a.points || Number(a.jersey) - Number(b.jersey));
  }, [goals, byJersey]);

  const assigned = lines.filter((l) => l.playerId);
  const unassigned = lines.filter((l) => !l.playerId);
  const goalieDuplicateIds = new Set(
    goalieRows
      .filter((g) => g.player)
      .map((g) => g.player!.id)
      .filter((id, i, arr) => arr.indexOf(id) !== i)
  );

  // Une confirmation « tout est exact » n'a de sens que si rien n'est resté
  // ambigu — sinon on force le passage par l'écran détaillé. Un numéro hors
  // effectif (recrue non ajoutée, faute de frappe) doit être vu, pas ignoré
  // en silence.
  const needsReview = unassigned.length > 0 || goalieDuplicateIds.size > 0 || parsed.isPreGame;

  function buildDecision(): ImportDecision {
    // Le sommaire du match (game_events) doit refléter la même correction :
    // on remplace, sur chaque but des As déjà présent dans le sommaire, le
    // buteur et les passeurs par ce qui a été posé ici — période et temps
    // identifient le même but des deux côtés.
    const events = parsed.events.map((e) => {
      if (e.side !== "us" || e.type !== "goal") return e;
      const edited = goals.find((g) => g.period === e.period && g.time === e.time);
      if (!edited) return e;
      const scorer = byJersey.get(edited.scorerJersey);
      const assists = [edited.assist1Jersey, edited.assist2Jersey]
        .filter((j): j is string => !!j)
        .map((j) => ({ jersey: j, name: byJersey.get(j)?.full_name ?? null }));
      return { ...e, jersey: edited.scorerJersey || null, playerName: scorer?.full_name ?? null, assists };
    });

    return {
      result: parsed.result,
      goalsFor: parsed.goalsFor,
      goalsAgainst: parsed.goalsAgainst,
      lines: assigned,
      penalties: parsed.penalties.map((x) => {
        const m = x.sheetName ? matchPlayer(x.sheetName, players) : null;
        return {
          playerId: m?.confidence === "exact" ? m.player.id : null,
          jersey: x.jersey ? Number(x.jersey) : null,
          code: x.code,
          period: x.period,
          time: x.time,
        };
      }),
      events,
      specialTeams: parsed.specialTeams,
      goalies: goalieRows
        .filter((g) => g.player)
        .map((g) => ({ playerId: g.player!.id, minutes: g.minutes, goalsAgainst: g.goalsAgainst })),
    };
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-white">Feuille de match lue</h3>
          <p className="text-sm text-slate-300">Rien n&apos;est enregistré pour l&apos;instant.</p>
        </div>

        {parsed.isPreGame && (
          <p className="text-sm text-amber-100 bg-amber-500/15 border border-amber-400/50 rounded-lg px-3 py-2">
            <strong>Feuille d&apos;avant-match.</strong> Elle ne contient que les alignements — aucun
            pointage ni statistique à compiler. Téléverse la version publiée après la partie.
          </p>
        )}

        {parsed.warnings.length > 0 && (
          <ul className="text-sm text-amber-200 bg-amber-500/10 border border-amber-400/40 rounded-lg px-3 py-2 list-disc list-inside space-y-0.5">
            {parsed.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs uppercase tracking-wide text-gold-400 font-bold mb-1">Match</div>
            <div className="text-white">{parsed.gameDate ?? "date illisible"}</div>
            <div className="text-slate-400">{parsed.location ?? ""}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs uppercase tracking-wide text-gold-400 font-bold mb-1">Adversaire</div>
            <div className="text-white">{parsed.opponent ?? "?"}</div>
            <div className="text-slate-400">{parsed.isHome === null ? "" : parsed.isHome ? "Domicile" : "Visiteur"}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs uppercase tracking-wide text-gold-400 font-bold mb-1">Pointage</div>
            <div className="text-white font-bold text-lg">
              {parsed.goalsFor ?? "?"} – {parsed.goalsAgainst ?? "?"}
            </div>
            <div className="text-slate-400">{parsed.result ? RESULT_LABEL[parsed.result] : "indéterminé"}</div>
          </div>
        </div>

        <div className="rounded-lg bg-white/5 p-3 text-sm text-slate-200 space-y-1">
          <div>
            <span className="font-bold text-white">{assigned.length}</span> pointeur(s)/passeur(s) seront mis à jour
            {unassigned.length > 0 && ` — ${unassigned.length} numéro(s) hors effectif ignoré(s)`}.
          </div>
          {goalieRows.length > 0 && (
            <div>
              Gardien{goalieRows.length > 1 ? "s" : ""} :{" "}
              {goalieRows
                .map((g) => `${g.player ? g.player.full_name : `#${g.jersey} ${g.sheetName}`} — ${g.minutes} min, ${g.goalsAgainst} but(s) alloué(s)`)
                .join(" · ")}
            </div>
          )}
          {needsReview && (
            <p className="text-amber-300 font-semibold">
              Au moins un numéro (pointeur ou gardien) n&apos;a pas pu être reconnu avec certitude — vérifie avant d&apos;enregistrer.
            </p>
          )}
        </div>

        <p className="text-sm font-semibold text-white">
          As-tu des corrections à apporter aux pointeurs du match ou au gardien avant d&apos;enregistrer ?
        </p>

        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn-secondary" onClick={() => setStep("edit")}>
            🖊 Oui, je veux vérifier/corriger
          </button>
          <button
            type="button"
            className="btn"
            disabled={applying || needsReview}
            onClick={() => onApply(buildDecision())}
            title={needsReview ? "Passe par la vérification : au moins un numéro est ambigu." : undefined}
          >
            {applying ? "Enregistrement..." : "✅ Tout est exact, enregistrer"}
          </button>
          <button className="btn-secondary" onClick={onCancel} disabled={applying}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-white">Corriger les pointeurs et le gardien</h3>
        <p className="text-sm text-slate-300">
          Change le numéro de chandail d&apos;une case au besoin, but par but — exactement comme sur la feuille papier. Les
          totaux se recalculent tout seuls. Rien n&apos;est enregistré tant que tu n&apos;as pas appuyé sur « Enregistrer ».
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-white/10">
              <th className="py-2 pr-3">But</th>
              <th className="py-2 pr-3">Période / temps</th>
              <th className="py-2 pr-3">Buteur</th>
              <th className="py-2 pr-3">Passe 1</th>
              <th className="py-2 pr-3">Passe 2</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g, idx) => (
              <tr key={g.index} className="border-b border-white/5 last:border-0">
                <td className="py-2 pr-3 text-slate-300 tabular-nums">{idx + 1}</td>
                <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">
                  P{g.period ?? "?"} {g.time ?? ""}
                </td>
                <td className="py-2 pr-3 min-w-[11rem]">
                  <JerseySelect
                    value={g.scorerJersey}
                    onChange={(v) => setGoalField(idx, "scorerJersey", v)}
                    roster={roster}
                    emptyLabel="— aucun buteur —"
                  />
                </td>
                <td className="py-2 pr-3 min-w-[11rem]">
                  <JerseySelect
                    value={g.assist1Jersey}
                    onChange={(v) => setGoalField(idx, "assist1Jersey", v)}
                    roster={roster}
                    emptyLabel="— aucune passe —"
                  />
                </td>
                <td className="py-2 pr-3 min-w-[11rem]">
                  <JerseySelect
                    value={g.assist2Jersey}
                    onChange={(v) => setGoalField(idx, "assist2Jersey", v)}
                    roster={roster}
                    emptyLabel="— aucune passe —"
                  />
                </td>
              </tr>
            ))}
            {goals.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-slate-500">
                  Aucun but des As de Québec sur cette feuille.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Totaux recalculés — lecture seule, pour vérifier d'un coup d'œil. */}
      <div>
        <h4 className="text-xs font-black uppercase tracking-widest text-gold-400 mb-1">Totaux (recalculés)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-1.5 pr-3">#</th>
                <th className="py-1.5 pr-3">Joueur</th>
                <th className="py-1.5 pr-3">B</th>
                <th className="py-1.5 pr-3">P</th>
                <th className="py-1.5 pr-3">PTS</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.jersey} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 pr-3 text-slate-300">{l.jersey}</td>
                  <td className={`py-1.5 pr-3 ${l.playerId ? "text-white" : "text-amber-300"}`}>
                    {l.sheetName}
                    {!l.playerId && <span className="text-xs"> — hors effectif, ignoré</span>}
                  </td>
                  <td className="py-1.5 pr-3">{l.goals}</td>
                  <td className="py-1.5 pr-3">{l.assists}</td>
                  <td className="py-1.5 pr-3 font-bold text-white">{l.points}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-2 text-slate-500">
                    Aucun pointeur pour l&apos;instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {parsed.penalties.length > 0 && (
        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-gold-400 mb-1">
            Punitions ({parsed.penalties.reduce((n, x) => n + x.minutes, 0)} min)
          </h4>
          <ul className="text-sm space-y-0.5">
            {parsed.penalties.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-white">
                <span>
                  #{x.jersey} {x.sheetName ?? ""}
                </span>
                <span className="text-slate-300">
                  {x.code} · {parsePenaltyCode(x.code).label} · P{x.period} {x.time}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {goalieRows.length > 0 && (
        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-gold-400 mb-1">Gardiens</h4>
          <ul className="space-y-2">
            {goalieRows.map((g, idx) => (
              <li key={`${g.jersey}-${idx}`} className="flex flex-wrap items-center gap-2 text-sm text-white">
                <span className="w-32 shrink-0">
                  #{g.jersey} {g.sheetName}
                </span>
                <input
                  type="number"
                  min={0}
                  className="input w-20 py-1"
                  value={g.minutes}
                  onChange={(e) => setGoalieStatFor(idx, "minutes", e.target.valueAsNumber)}
                />
                <span className="text-slate-400 text-xs">min</span>
                <input
                  type="number"
                  min={0}
                  className="input w-20 py-1"
                  value={g.goalsAgainst}
                  onChange={(e) => setGoalieStatFor(idx, "goalsAgainst", e.target.valueAsNumber)}
                />
                <span className="text-slate-400 text-xs">but(s) alloué(s)</span>
                <select
                  className="input py-1 flex-1 min-w-[10rem]"
                  value={g.player?.id ?? ""}
                  onChange={(e) => setGoaliePlayerFor(idx, e.target.value)}
                >
                  <option value="">— ignorer ce gardien —</option>
                  {players
                    .filter((p) => p.position === "G")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.jersey_number ? `${p.jersey_number} — ` : ""}
                        {p.full_name}
                      </option>
                    ))}
                </select>
                {!g.player && <span className="text-xs text-amber-300 shrink-0">non reconnu, ignoré</span>}
                {g.player && goalieDuplicateIds.has(g.player.id) && (
                  <span className="text-xs text-red-400 shrink-0">⚠ choisi deux fois</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-slate-300">
        {assigned.length} joueur(s) seront mis à jour
        {unassigned.length > 0 && ` — ${unassigned.length} numéro(s) hors effectif ignoré(s)`}.
      </p>

      <div className="flex gap-2 flex-wrap">
        <button className="btn" disabled={applying || goalieDuplicateIds.size > 0} onClick={() => onApply(buildDecision())}>
          {applying ? "Enregistrement..." : "💾 Enregistrer"}
        </button>
        <button className="btn-secondary" onClick={() => setStep("confirm")} disabled={applying}>
          ← Retour
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={applying}>
          Annuler
        </button>
      </div>
      {goalieDuplicateIds.size > 0 && (
        <p className="text-sm text-red-400">Corrige les gardiens sélectionnés en double avant d&apos;enregistrer.</p>
      )}
    </div>
  );
}
