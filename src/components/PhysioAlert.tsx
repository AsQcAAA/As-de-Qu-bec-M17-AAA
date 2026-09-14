"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import { PHYSIO_SHEET_URL, isRestricted } from "@/lib/physio";
import type { Player } from "@/lib/types";

interface Consultation {
  player_id: string;
  consult_date: string;
  clinical_impression: string | null;
  state: string | null;
  recommendations: string | null;
  review_in: string | null;
  appointment_type: string | null;
}

/**
 * Alerte des nouvelles consultations de physiothérapie.
 *
 * La feuille de la clinique est relue à chaque ouverture de l'accueil ; toute
 * ligne nouvelle ou corrigée depuis la dernière fois ouvre un popup. Le coach
 * confirme l'avoir lue, et elle ne réapparaît plus — jusqu'à la prochaine
 * modification par la clinique.
 */
export default function PhysioAlert() {
  const supabase = createClient();
  const [pending, setPending] = useState<(Consultation & { player: Player })[]>([]);
  const [open, setOpen] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    async function run() {
      // La synchronisation passe par le serveur : Google refuse la lecture
      // directe du CSV depuis le navigateur.
      try {
        await fetch("/api/physio/sync", { method: "POST" });
      } catch {
        // Hors ligne ou feuille inaccessible : on affiche quand même ce qui
        // est déjà connu, sans bloquer l'accueil.
      }
      const [{ data: rows }, { data: players }] = await Promise.all([
        supabase.from("physio_consultations").select("*").is("seen_at", null).order("consult_date", { ascending: false }),
        supabase.from("players").select("*"),
      ]);
      const byId = new Map((players ?? []).map((p) => [p.id, p]));
      const list = (rows ?? [])
        .map((r) => {
          const player = byId.get(r.player_id);
          return player ? { ...(r as Consultation), player } : null;
        })
        .filter((x): x is Consultation & { player: Player } => !!x);
      setPending(list);
      setOpen(list.length > 0);
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acknowledge() {
    setAcknowledging(true);
    const now = new Date().toISOString();
    for (const c of pending) {
      await supabase
        .from("physio_consultations")
        .update({ seen_at: now })
        .eq("player_id", c.player_id)
        .eq("consult_date", c.consult_date);
    }
    setPending([]);
    setOpen(false);
    setAcknowledging(false);
  }

  if (!open || pending.length === 0) return null;

  return (
    <Modal onClose={() => setOpen(false)}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            🩺 {pending.length} nouvelle{pending.length > 1 ? "s" : ""} consultation
            {pending.length > 1 ? "s" : ""} en physiothérapie
          </h1>
          <p className="text-sm text-slate-400">
            Relevées dans la feuille de la clinique PCN. Une consultation n&apos;est pas une blessure : elle n&apos;entre
            pas dans la chronologie tant qu&apos;aucune activité n&apos;est manquée.
          </p>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {pending.map((c) => (
            <div key={`${c.player_id}-${c.consult_date}`} className="rounded-lg bg-white/[0.06] p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/joueurs/${c.player_id}`} className="font-black text-white hover:underline">
                  #{c.player.jersey_number ?? "–"} {c.player.full_name}
                </Link>
                <span className="text-xs text-slate-400 tabular-nums">{c.consult_date}</span>
                {c.state && (
                  <span
                    className={`badge ${
                      isRestricted(c.state) ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                    }`}
                  >
                    {c.state}
                  </span>
                )}
              </div>
              {c.clinical_impression && (
                <div className="text-sm text-slate-200">
                  <span className="font-bold">Impression :</span> {c.clinical_impression}
                </div>
              )}
              {c.recommendations && (
                <p className="text-sm text-slate-300 whitespace-pre-line">{c.recommendations}</p>
              )}
              <div className="text-xs text-slate-500">
                {c.appointment_type}
                {c.review_in ? ` · à revoir dans ${c.review_in}` : ""}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={acknowledge} disabled={acknowledging} className="btn">
            {acknowledging ? "Enregistrement..." : "J'ai pris connaissance"}
          </button>
          <a href={PHYSIO_SHEET_URL} target="_blank" rel="noreferrer" className="btn-secondary">
            Ouvrir la feuille PCN →
          </a>
        </div>
      </div>
    </Modal>
  );
}
