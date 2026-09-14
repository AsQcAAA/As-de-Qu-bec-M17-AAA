"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PHYSIO_SHEET_URL, isRestricted } from "@/lib/physio";
import type { Player } from "@/lib/types";

export interface PhysioConsultation {
  player_id: string;
  consult_date: string;
  clinical_impression: string | null;
  intervention_plan: string | null;
  state: string | null;
  clinical_followup: string | null;
  recommendations: string | null;
  review_in: string | null;
  appointment_type: string | null;
  seen_at: string | null;
}

/**
 * Consultations de physiothérapie, telles que saisies par la clinique.
 *
 * Volontairement séparé des blessures : une consultation peut être un simple
 * dépistage. Ce bloc informe ; il ne déclenche aucun décompte d'absence ni
 * d'épisode de blessure.
 *
 * `playerId` restreint la liste à un joueur (fiche de joueur) ; sans lui, tout
 * l'effectif est affiché (onglet Blessures).
 */
export default function PhysioConsultations({ playerId }: { playerId?: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<PhysioConsultation[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  /** Noms de la feuille qu'aucun joueur ne peut réclamer — à signaler. */
  const [unmatched, setUnmatched] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      // Relecture de la feuille : la clinique peut avoir ajouté une ligne
      // depuis le dernier passage sur l'accueil.
      try {
        const res = await fetch("/api/physio/sync", { method: "POST" });
        const body = await res.json();
        setUnmatched(body.unmatched ?? []);
      } catch {
        // La feuille est peut-être injoignable ; on affiche ce qui est connu.
      }
      const query = supabase
        .from("physio_consultations")
        .select("*")
        .order("consult_date", { ascending: false });
      const [{ data }, { data: pls }] = await Promise.all([
        playerId ? query.eq("player_id", playerId) : query,
        supabase.from("players").select("*"),
      ]);
      setRows((data ?? []) as PhysioConsultation[]);
      setPlayers(pls ?? []);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const byId = new Map(players.map((p) => [p.id, p]));

  if (loading) return <p className="text-sm text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Repris de la feuille de la clinique PCN.{" "}
        <a href={PHYSIO_SHEET_URL} target="_blank" rel="noreferrer" className="text-gold-600 hover:underline">
          Ouvrir la feuille →
        </a>{" "}
        Une consultation n&apos;est pas une blessure : elle n&apos;entre dans la chronologie que si une activité est
        manquée.
      </p>

      {unmatched.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {unmatched.length} ligne(s) de la feuille ne correspondent à aucun joueur de l&apos;effectif :{" "}
          <span className="font-bold">{unmatched.join(", ")}</span>. Corrige l&apos;orthographe dans la feuille pour
          qu&apos;elles apparaissent ici.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune consultation enregistrée.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const player = byId.get(c.player_id);
            return (
              <li key={`${c.player_id}-${c.consult_date}`} className="rounded-lg border border-slate-200 p-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {!playerId && player && (
                    <Link href={`/joueurs/${player.id}`} className="font-bold text-ink-900 hover:underline">
                      #{player.jersey_number ?? "–"} {player.full_name}
                    </Link>
                  )}
                  <span className="text-sm tabular-nums text-slate-500">{c.consult_date}</span>
                  {c.state && (
                    <span
                      className={`badge ${
                        isRestricted(c.state) ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {c.state}
                    </span>
                  )}
                  {!c.seen_at && <span className="badge bg-gold-100 text-gold-800">Nouveau</span>}
                </div>
                {c.clinical_impression && (
                  <div className="text-sm">
                    <span className="font-semibold">Impression clinique :</span> {c.clinical_impression}
                  </div>
                )}
                {c.intervention_plan && (
                  <div className="text-sm">
                    <span className="font-semibold">Plan :</span> {c.intervention_plan}
                  </div>
                )}
                {c.recommendations && (
                  <p className="text-sm text-slate-600 whitespace-pre-line">{c.recommendations}</p>
                )}
                <div className="text-xs text-slate-400">
                  {c.appointment_type}
                  {c.review_in ? ` · à revoir dans ${c.review_in}` : ""}
                  {c.clinical_followup ? ` · suivi clinique : ${c.clinical_followup}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
