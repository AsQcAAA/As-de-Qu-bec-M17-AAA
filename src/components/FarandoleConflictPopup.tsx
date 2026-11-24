"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";

const DISMISS_KEY = "farandole-conflict-dismissed-";

type Conflict = { date: string; playerId: string; name: string; jersey: number | null; detail: string };
type Candidate = { id: string; name: string; jersey: number | null; count: number };

/**
 * Avertit quand un joueur assigné à une Farandole à venir est aussi convoqué
 * à une période étoilée à l'école la même journée (absence « École » dont le
 * détail contient « étoilée »). Chaque conflit n'est signalé qu'une fois : un
 * nouveau conflit fait réapparaître le pop-up.
 */
export default function FarandoleConflictPopup() {
  const supabase = createClient();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  /** Remplaçants proposés par conflit (clé date+joueur), du moins souvent assigné au plus souvent. */
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});

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
      if (fresh.length === 0) return;

      const [{ data: allRows }, { data: pls }, { data: dayAbs }] = await Promise.all([
        supabase.from("farandole_assignments").select("assignment_date, player_ids"),
        supabase.from("players").select("id, full_name, jersey_number").eq("active", true).eq("is_call_up", false),
        supabase.from("absences").select("player_id, absence_date").in("absence_date", [...new Set(fresh.map((c) => c.date))]),
      ]);
      const byDate: Record<string, string[]> = Object.fromEntries((allRows ?? []).map((r) => [r.assignment_date as string, (r.player_ids ?? []) as string[]]));
      const tally = new Map<string, number>();
      for (const ids of Object.values(byDate)) for (const id of ids) tally.set(id, (tally.get(id) ?? 0) + 1);
      const cand: Record<string, Candidate[]> = {};
      for (const c of fresh) {
        const taken = new Set(byDate[c.date] ?? []);
        const absent = new Set((dayAbs ?? []).filter((a) => a.absence_date === c.date).map((a) => a.player_id));
        cand[c.date + c.playerId] = (pls ?? [])
          .filter((p) => !taken.has(p.id) && !absent.has(p.id))
          .map((p) => ({ id: p.id, name: p.full_name, jersey: p.jersey_number, count: tally.get(p.id) ?? 0 }))
          .sort((a, b) => a.count - b.count || (a.jersey ?? 99) - (b.jersey ?? 99));
      }
      setAssignments(byDate);
      setCandidates(cand);
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

  async function replace(c: Conflict, newId: string, newName: string) {
    const key = c.date + c.playerId;
    setBusy(key);
    try {
      const ids = (assignments[c.date] ?? []).map((id) => (id === c.playerId ? newId : id));
      const { error } = await supabase.from("farandole_assignments").upsert({ assignment_date: c.date, player_ids: ids }, { onConflict: "assignment_date" });
      if (error) {
        alert("Erreur : " + error.message);
        return;
      }
      setAssignments((prev) => ({ ...prev, [c.date]: ids }));
      // Le remplaçant n'est plus disponible pour un autre conflit de la même date.
      setCandidates((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) if (k.startsWith(c.date)) next[k] = next[k].filter((x) => x.id !== newId);
        return next;
      });
      setDone((prev) => ({ ...prev, [key]: newName }));
      try {
        localStorage.setItem(DISMISS_KEY + key, "1");
      } catch {}
    } finally {
      setBusy(null);
    }
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
              {done[c.date + c.playerId] ? (
                <div className="mt-2 text-sm font-semibold text-emerald-300">✓ Remplacé par {done[c.date + c.playerId]}</div>
              ) : (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs font-bold uppercase tracking-widest text-gold-400">Remplaçant proposé (moins souvent assigné d&apos;abord)</div>
                  <div className="flex flex-wrap gap-2">
                    {(candidates[c.date + c.playerId] ?? []).slice(0, 6).map((p) => (
                      <button
                        key={p.id}
                        className="btn-secondary text-sm"
                        disabled={busy !== null}
                        onClick={() => replace(c, p.id, p.name)}
                      >
                        #{p.jersey ?? "?"} {p.name} — {p.count} fois
                      </button>
                    ))}
                  </div>
                  {(candidates[c.date + c.playerId] ?? []).length > 6 && (
                    <select
                      className="input text-sm"
                      value=""
                      disabled={busy !== null}
                      onChange={(e) => {
                        const p = candidates[c.date + c.playerId].find((x) => x.id === e.target.value);
                        if (p) replace(c, p.id, p.name);
                      }}
                    >
                      <option value="">Autre joueur…</option>
                      {candidates[c.date + c.playerId].slice(6).map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.jersey ?? "?"} {p.name} — {p.count} fois
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 flex-wrap">
          <Link href="/farandole" className="btn" onClick={dismiss}>
            Modifier la Farandole
          </Link>
          <button className="btn-secondary" onClick={dismiss}>
            {conflicts.every((c) => done[c.date + c.playerId]) ? "Fermer" : "Garder tel quel"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
