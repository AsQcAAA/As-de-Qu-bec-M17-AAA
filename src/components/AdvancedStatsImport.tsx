"use client";

import { useMemo, useState } from "react";
import { matchPlayer } from "@/lib/gameSheet";
import {
  secondsToToi,
  toiToSeconds,
  type ParsedAdvancedReport,
  type TpeFaceoffBreakdown,
  type TpeFaceoffZoneGrid,
  type TpeShotsBreakdown,
} from "@/lib/tpeReport";
import type { Player } from "@/lib/types";

/** Une ligne éditable, avant enregistrement. */
export interface AdvancedStatLine {
  jersey: number;
  sheetName: string;
  playerId: string | null;
  confidence: "exact" | "probable" | "manuel" | null;
  toiSeconds: number | null;
  shotsOnGoal: number | null;
  faceoffsWon: number | null;
  faceoffsLost: number | null;
  plusMinus: number | null;
  onIceXgFor: number | null;
  onIceXgAgainst: number | null;
  onIceXgForPer20: number | null;
  onIceXgAgainstPer20: number | null;
  xg: number | null;
  xgPer20: number | null;
}

export interface AdvancedStatsDecision {
  lines: AdvancedStatLine[];
  shots: TpeShotsBreakdown | null;
  faceoffs: TpeFaceoffBreakdown | null;
  faceoffZones: TpeFaceoffZoneGrid | null;
  teamXgUs: number | null;
  teamXgOpponent: number | null;
}

/**
 * Aperçu du rapport de statistiques avancées TPE, en pop-up avant tout
 * enregistrement — même principe que la feuille de match : rien n'est écrit
 * tant que le coach n'a pas confirmé, et il peut corriger un joueur mal
 * reconnu ou un nombre mal lu directement ici.
 */
export default function AdvancedStatsImport({
  parsed,
  players,
  onApply,
  onCancel,
  applying,
}: {
  parsed: ParsedAdvancedReport;
  players: Player[];
  onApply: (decision: AdvancedStatsDecision) => void;
  onCancel: () => void;
  applying: boolean;
}) {
  const initialLines: AdvancedStatLine[] = useMemo(
    () =>
      parsed.players.map((p) => {
        // Le numéro de chandail est la colonne « # » du rapport, exacte et
        // sans ambiguïté — bien plus fiable que le nom (qui peut être un
        // repli du genre « Quebec As M17 5 » quand TPE ne connaît pas le
        // joueur). On ne retombe sur le nom que si le numéro ne correspond
        // à personne dans l'effectif actif.
        const byJersey = players.find((pl) => pl.jersey_number === p.jersey);
        const m = byJersey ? null : matchPlayer(p.sheetName, players);
        return {
          jersey: p.jersey,
          sheetName: byJersey ? byJersey.full_name : p.sheetName,
          playerId: byJersey ? byJersey.id : m?.confidence === "exact" ? m.player.id : null,
          confidence: byJersey ? "exact" : (m?.confidence ?? null),
          toiSeconds: p.toiSeconds,
          shotsOnGoal: p.shotsOnGoal,
          faceoffsWon: p.faceoffsWon,
          faceoffsLost: p.faceoffsLost,
          plusMinus: p.plusMinus,
          onIceXgFor: p.onIceXgFor,
          onIceXgAgainst: p.onIceXgAgainst,
          onIceXgForPer20: p.onIceXgForPer20,
          onIceXgAgainstPer20: p.onIceXgAgainstPer20,
          xg: p.xg,
          xgPer20: p.xgPer20,
          suggestedId: m?.player.id ?? null,
        } as AdvancedStatLine & { suggestedId: string | null };
      }),
    [parsed, players]
  );

  const [step, setStep] = useState<"confirm" | "edit">("confirm");
  const [lines, setLines] = useState<AdvancedStatLine[]>(initialLines);
  const [showXg, setShowXg] = useState(false);

  const suggestions = useMemo(
    () => new Map(initialLines.map((l, i) => [i, (l as AdvancedStatLine & { suggestedId: string | null }).suggestedId])),
    [initialLines]
  );

  function setPlayerFor(idx: number, playerId: string) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, playerId: playerId || null, confidence: playerId ? "manuel" : null } : l))
    );
  }

  function setField<K extends keyof AdvancedStatLine>(idx: number, field: K, value: AdvancedStatLine[K]) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  const assigned = lines.filter((l) => l.playerId);
  const unassigned = lines.filter((l) => !l.playerId);
  const duplicateIds = new Set(assigned.map((l) => l.playerId!).filter((id, i, arr) => arr.indexOf(id) !== i));
  const needsReview = duplicateIds.size > 0 || lines.some((l, i) => !l.playerId && suggestions.get(i));
  const nameById = new Map(players.map((p) => [p.id, p.full_name]));

  function buildDecision(): AdvancedStatsDecision {
    return {
      lines: assigned,
      shots: parsed.shots,
      faceoffs: parsed.faceoffs,
      faceoffZones: parsed.faceoffZones,
      teamXgUs: parsed.teamXgUs,
      teamXgOpponent: parsed.teamXgOpponent,
    };
  }

  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-white">Rapport de statistiques avancées lu</h3>
          <p className="text-sm text-slate-300">Rien n&apos;est enregistré pour l&apos;instant.</p>
        </div>

        {parsed.warnings.length > 0 && (
          <ul className="text-sm text-amber-200 bg-amber-500/10 border border-amber-400/40 rounded-lg px-3 py-2 list-disc list-inside space-y-0.5">
            {parsed.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs uppercase tracking-wide text-gold-400 font-bold mb-1">As de Québec</div>
            <div className="text-white">{parsed.ourTeamName ?? "?"}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-3">
            <div className="text-xs uppercase tracking-wide text-gold-400 font-bold mb-1">Adversaire</div>
            <div className="text-white">{parsed.opponentName ?? "?"}</div>
          </div>
        </div>

        <div className="rounded-lg bg-white/5 p-3 text-sm text-slate-200 space-y-1">
          <div>
            <span className="font-bold text-white">{assigned.length}</span> joueur(s) seront mis à jour (temps de jeu, tirs, mises au jeu, +/-, xG)
            {unassigned.length > 0 && ` — ${unassigned.length} ligne(s) ignorée(s)`}.
          </div>
          {parsed.shots && (
            <div>
              Tirs au but : nous {parsed.shots.us.total.shotsOnGoal} — adversaire {parsed.shots.opponent.total.shotsOnGoal}
            </div>
          )}
          {parsed.faceoffs && (
            <div>
              Mises au jeu : {parsed.faceoffs.total.won} gagnées, {parsed.faceoffs.total.lost} perdues
            </div>
          )}
          {(parsed.teamXgUs != null || parsed.teamXgOpponent != null) && (
            <div>
              xG d&apos;équipe : nous {parsed.teamXgUs ?? "?"} — adversaire {parsed.teamXgOpponent ?? "?"}
            </div>
          )}
          {needsReview && (
            <p className="text-amber-300 font-semibold">Au moins un joueur n&apos;a pas pu être reconnu avec certitude — vérifie avant d&apos;enregistrer.</p>
          )}
        </div>

        <p className="text-sm font-semibold text-white">Veux-tu vérifier ou corriger ces statistiques avant de les enregistrer ?</p>

        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn-secondary" onClick={() => setStep("edit")}>
            🖊 Oui, je veux vérifier/corriger
          </button>
          <button
            type="button"
            className="btn"
            disabled={applying || needsReview}
            onClick={() => onApply(buildDecision())}
            title={needsReview ? "Passe par la vérification : au moins un joueur est ambigu." : undefined}
          >
            {applying ? "Application..." : "✅ Tout est exact, enregistrer"}
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
        <h3 className="font-bold text-white">Corriger les statistiques avancées</h3>
        <p className="text-sm text-slate-300">
          Corrige le joueur ou une valeur au besoin, puis applique. Rien n&apos;est enregistré tant que tu n&apos;as pas appuyé sur « Appliquer ».
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-white/10">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Nom sur le rapport</th>
              <th className="py-2 pr-3">TOI</th>
              <th className="py-2 pr-3">Tirs</th>
              <th className="py-2 pr-3">MAJ G</th>
              <th className="py-2 pr-3">MAJ P</th>
              <th className="py-2 pr-3">+/-</th>
              <th className="py-2 pr-3">Joueur de l&apos;effectif</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => {
              const suggested = suggestions.get(idx);
              const needsConfirm = !l.playerId && suggested;
              return (
                <tr key={`${l.jersey}-${idx}`} className="border-b border-white/5 last:border-0 align-top">
                  <td className="py-2 pr-3 text-slate-300">{l.jersey}</td>
                  <td className="py-2 pr-3 text-white">{l.sheetName}</td>
                  <td className="py-2 pr-3">
                    <input
                      className="input w-16 py-1"
                      value={l.toiSeconds != null ? secondsToToi(l.toiSeconds) : ""}
                      placeholder="mm:ss"
                      onChange={(e) => setField(idx, "toiSeconds", toiToSeconds(e.target.value))}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min={0}
                      className="input w-16 py-1"
                      value={l.shotsOnGoal ?? ""}
                      onChange={(e) => setField(idx, "shotsOnGoal", e.target.value === "" ? null : e.target.valueAsNumber)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min={0}
                      className="input w-16 py-1"
                      value={l.faceoffsWon ?? ""}
                      onChange={(e) => setField(idx, "faceoffsWon", e.target.value === "" ? null : e.target.valueAsNumber)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min={0}
                      className="input w-16 py-1"
                      value={l.faceoffsLost ?? ""}
                      onChange={(e) => setField(idx, "faceoffsLost", e.target.value === "" ? null : e.target.valueAsNumber)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      className="input w-16 py-1"
                      value={l.plusMinus ?? ""}
                      onChange={(e) => setField(idx, "plusMinus", e.target.value === "" ? null : e.target.valueAsNumber)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select className="input py-1" value={l.playerId ?? ""} onChange={(e) => setPlayerFor(idx, e.target.value)}>
                      <option value="">— ignorer ce joueur —</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.jersey_number ? `${p.jersey_number} — ` : ""}
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                    {l.confidence === "exact" && <span className="text-xs text-green-400">✓ nom identique</span>}
                    {needsConfirm && (
                      <span className="text-xs text-amber-300">⚠ ressemble à « {nameById.get(suggested!)} » — à confirmer</span>
                    )}
                    {!l.playerId && !suggested && <span className="text-xs text-slate-500">Aucun joueur reconnu</span>}
                    {duplicateIds.has(l.playerId ?? "") && <span className="text-xs text-red-400">⚠ choisi deux fois</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button type="button" className="text-xs text-gold-400 hover:underline" onClick={() => setShowXg((v) => !v)}>
        {showXg ? "▾ Cacher le détail xG" : "▸ Voir/corriger le détail xG (avancé)"}
      </button>

      {showXg && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">On ice xG for</th>
                <th className="py-2 pr-3">On ice xG against</th>
                <th className="py-2 pr-3">On ice xG for /20</th>
                <th className="py-2 pr-3">On ice xG against /20</th>
                <th className="py-2 pr-3">Xg</th>
                <th className="py-2 pr-3">Xg /20</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={`xg-${l.jersey}-${idx}`} className="border-b border-white/5 last:border-0">
                  <td className="py-2 pr-3 text-slate-300">{l.jersey}</td>
                  {(["onIceXgFor", "onIceXgAgainst", "onIceXgForPer20", "onIceXgAgainstPer20", "xg", "xgPer20"] as const).map((field) => (
                    <td key={field} className="py-2 pr-3">
                      <input
                        type="number"
                        step="0.1"
                        className="input w-20 py-1"
                        value={l[field] ?? ""}
                        onChange={(e) => setField(idx, field, e.target.value === "" ? null : e.target.valueAsNumber)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-slate-300">
        {assigned.length} joueur(s) seront mis à jour{unassigned.length > 0 && ` — ${unassigned.length} ligne(s) seront ignorées`}.
      </p>

      <div className="flex gap-2 flex-wrap">
        <button className="btn" disabled={applying || duplicateIds.size > 0} onClick={() => onApply(buildDecision())}>
          {applying ? "Application..." : "Appliquer aux joueurs et au match"}
        </button>
        <button className="btn-secondary" onClick={() => setStep("confirm")} disabled={applying}>
          ← Retour
        </button>
        <button className="btn-secondary" onClick={onCancel} disabled={applying}>
          Annuler
        </button>
      </div>
      {duplicateIds.size > 0 && <p className="text-sm text-red-400">Corrige les joueurs sélectionnés en double avant d&apos;appliquer.</p>}
    </div>
  );
}
