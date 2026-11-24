"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";

const DISMISS_KEY = "farandole-conflict-dismissed-";

type Conflict = { date: string; playerId: string; name: string; jersey: number | null; detail: string };

/**
 * Avertit quand un joueur assigné à une Farandole à venir est aussi convoqué
 * à une période étoilée à l'école la même journée (absence « École » dont le
 * détail contient « étoilée »). Chaque conflit n'est signalé qu'une fois : un
 * nouveau conflit fait réapparaître le pop-up.
 */
export default function FarandoleConflictPopup() {
  const supabase = createClient();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    (async () => {
      const { data: rows } = await supabase
        .from("farandole_assignments")
        .select("assignment_date, player_ids")
        .gte("assignment_date", today);
      const assigned = (rows ?? []).filter((r) => (r.player_ids ?? []).length > 0);
      if (assigned.length === 0) return;
      const { data: abs } = await supabase
        .from("absences")
        .select("player_id, absence_date, detail, players(full_name, jersey_number)")
        .in("absence_date", assigned.map((r) => r.assignment_date as string))
        .ilike("detail", "%toil%");
      const found: Conflict[] = [];
      for (const a of abs ?? []) {
        const row = assigned.find((r) => r.assignment_date === a.absence_date);
        if (!row || !(row.player_ids as string[]).includes(a.player_id)) continue;
        const p = (Array.isArray(a.players) ? a.players[0] : a.players) as { full_name: string; jersey_number: number | null } | null;
        found.push({ date: a.absence_date, playerId: a.player_id, name: p?.full_name ?? "Joueur", jersey: p?.jersey_number ?? null, detail: a.detail ?? "Période étoilée" });
      }
      const fresh = found.filter((c) => {
        try {
          return localStorage.getItem(DISMISS_KEY + c.date + c.playerId) !== "1";
        } catch {
          return true;
        }
      });
      fresh.sort((x, y) => x.date.localeCompare(y.date));
      setConflicts(fresh);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    try {
      for (const c of conflicts) localStorage.setItem(DISMISS_KEY + c.date + c.playerId, "1");
    } catch {}
    setConflicts([]);
  }

  if (conflicts.length === 0) return null;

  return (
    <Modal onClose={dismiss}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">⚠️ Conflit Farandole / école</h1>
          <p className="text-slate-400 text-sm">
            {conflicts.length > 1 ? "Ces joueurs sont" : "Ce joueur est"} sur l&apos;horaire de la Farandole et en période étoilée à l&apos;école la même journée.
          </p>
        </div>
        <ul className="space-y-2">
          {conflicts.map((c) => (
            <li key={c.date + c.playerId} className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-amber-100">
              <div className="font-bold">
                #{c.jersey ?? "?"} {c.name}
              </div>
              <div className="text-sm capitalize">
                {format(new Date(`${c.date}T12:00:00`), "EEEE d MMMM", { locale: fr })} — {c.detail}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 flex-wrap">
          <Link href="/farandole" className="btn" onClick={dismiss}>
            Modifier la Farandole
          </Link>
          <button className="btn-secondary" onClick={dismiss}>
            OK, compris
          </button>
        </div>
      </div>
    </Modal>
  );
}
