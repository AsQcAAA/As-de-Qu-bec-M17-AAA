"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { useCoachDirectory } from "@/lib/useCoach";
import { lastName } from "@/lib/players";
import type { Meeting, Player } from "@/lib/types";

type Draft = { topic: string; notes: string };

/**
 * Compte rendu des rencontres individuelles d'une journée, depuis l'accueil :
 * on coche les joueurs rencontrés, puis on note le sujet et les notes de chacun.
 * Tout est écrit dans la table des rencontres — donc il apparaît tel quel dans
 * la fiche de chaque joueur et dans l'onglet Meeting, sans double saisie.
 */
export default function IndividualMeetingsPopupContent({
  date,
  scheduledTimes,
  onSaved,
  onClose,
}: {
  date: string;
  /** Heures des rencontres prévues à l'horaire (ex. ["15:45"]). */
  scheduledTimes: string[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const { myId } = useCoachDirectory();
  const [players, setPlayers] = useState<Player[]>([]);
  const [existing, setExisting] = useState<Meeting[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("players").select("*").eq("active", true).eq("is_call_up", false).order("jersey_number"),
      supabase.from("meetings").select("*").eq("meeting_date", date).eq("meeting_type", "individual"),
    ]).then(([{ data: pls }, { data: mts }]) => {
      const rows = (mts ?? []) as Meeting[];
      setPlayers(pls ?? []);
      setExisting(rows);
      setSelected(new Set(rows.map((m) => m.player_id).filter((id): id is string => !!id)));
      setDrafts(
        Object.fromEntries(
          rows.filter((m) => m.player_id).map((m) => [m.player_id as string, { topic: m.topic ?? "", notes: m.notes ?? "" }])
        )
      );
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const selectedPlayers = useMemo(() => players.filter((p) => selected.has(p.id)), [players, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { topic: "", notes: "" }), ...patch } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const byPlayer = new Map(existing.map((m) => [m.player_id, m]));
    const ops: PromiseLike<{ error: { message: string } | null }>[] = [];

    for (const p of selectedPlayers) {
      const d = drafts[p.id] ?? { topic: "", notes: "" };
      const payload = { topic: d.topic.trim() || null, notes: d.notes.trim() || null, updated_by: myId };
      const row = byPlayer.get(p.id);
      ops.push(
        row
          ? supabase.from("meetings").update(payload).eq("id", row.id)
          : supabase.from("meetings").insert({ meeting_date: date, meeting_type: "individual", player_id: p.id, ...payload })
      );
    }
    // Un joueur décoché qui avait déjà une rencontre ce jour-là : on la retire.
    for (const row of existing) {
      if (row.player_id && !selected.has(row.player_id)) ops.push(supabase.from("meetings").delete().eq("id", row.id));
    }

    const results = await Promise.all(ops);
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setError(failed.error.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Meetings individuels</h1>
        <p className="text-slate-400 text-sm capitalize">
          {format(parseISO(date), "EEEE d MMMM", { locale: fr })}
          {scheduledTimes.length > 0 && <span className="normal-case"> — prévus à {scheduledTimes.join(", ")}</span>}
        </p>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Chargement…</p>
      ) : (
        <>
          <section className="card space-y-2">
            <h2 className="font-semibold">Joueurs rencontrés</h2>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => {
                const on = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`rounded-full border-2 px-3 py-1 text-sm font-semibold transition-colors ${
                      on ? "bg-gold-500 border-gold-600 text-ink-900" : "bg-white border-slate-300 text-ink-800 hover:border-gold-400"
                    }`}
                  >
                    {p.jersey_number ? `#${p.jersey_number} ` : ""}
                    {lastName(p.full_name)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              {selectedPlayers.length} joueur{selectedPlayers.length > 1 ? "s" : ""} — les notes ci-dessous s&apos;ajoutent
              automatiquement à leur fiche.
            </p>
          </section>

          {selectedPlayers.map((p) => (
            <section key={p.id} className="card space-y-2">
              <h3 className="font-semibold">
                {p.jersey_number ? `#${p.jersey_number} ` : ""}
                {p.full_name}
              </h3>
              <div>
                <label className="label">Sujet</label>
                <input
                  className="input"
                  value={drafts[p.id]?.topic ?? ""}
                  onChange={(e) => setDraft(p.id, { topic: e.target.value })}
                  placeholder="De quoi avez-vous parlé ?"
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input"
                  rows={3}
                  value={drafts[p.id]?.notes ?? ""}
                  onChange={(e) => setDraft(p.id, { notes: e.target.value })}
                />
              </div>
            </section>
          ))}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button type="button" className="btn" disabled={saving} onClick={save}>
              {saving ? "Enregistrement…" : `Enregistrer (${selectedPlayers.length})`}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Plus tard
            </button>
          </div>
        </>
      )}
    </div>
  );
}
