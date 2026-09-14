"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { ABSENCE_REASON_LABEL, ABSENCE_REASON_ORDER } from "@/lib/absenceReasons";
import type { AbsenceReason, Player } from "@/lib/types";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

interface Row {
  playerId: string;
  reason: AbsenceReason;
}

// Popup des jours de pratique seulement : les jours de match, les blessés et
// suspendus se saisissent dans l'alignement du match.
export default function AbsencePopupContent({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [addSelect, setAddSelect] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: pls }, { data: abs }] = await Promise.all([
        supabase.from("players").select("*").eq("active", true).eq("is_call_up", false).order("jersey_number"),
        supabase.from("absences").select("*").eq("absence_date", todayStr()),
      ]);
      setPlayers(pls ?? []);
      setRows((abs ?? []).map((a) => ({ playerId: a.player_id, reason: (a.reason as AbsenceReason) ?? "non_justifie" })));
      setLoading(false);
    }
    load();
  }, []);

  function addPlayer(playerId: string) {
    if (!playerId || rows.some((r) => r.playerId === playerId)) return;
    setRows([...rows, { playerId, reason: "non_justifie" }]);
    setAddSelect("");
  }

  function updateReason(playerId: string, reason: AbsenceReason) {
    setRows(rows.map((r) => (r.playerId === playerId ? { ...r, reason } : r)));
  }

  function removeRow(playerId: string) {
    setRows(rows.filter((r) => r.playerId !== playerId));
  }

  async function handleSave() {
    setSaving(true);
    const today = todayStr();
    await supabase.from("absences").delete().eq("absence_date", today);
    if (rows.length > 0) {
      await supabase.from("absences").insert(rows.map((r) => ({ player_id: r.playerId, absence_date: today, reason: r.reason })));
    }
    await supabase.from("daily_checks").upsert({ check_date: today }, { onConflict: "check_date" });
    setSaving(false);
    onClose();
  }

  const available = players.filter((p) => !rows.some((r) => r.playerId === p.id));
  const nameById = new Map(players.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Absences du jour</h1>
        <p className="text-slate-400 text-sm">{format(new Date(), "EEEE d MMMM")} — ajoute les joueurs absents et leur raison.</p>
      </div>

      {loading ? (
        <p className="text-slate-300">Chargement...</p>
      ) : (
        <div className="card space-y-4">
          <div>
            <label className="label">Ajouter un joueur absent</label>
            <select
              className="input"
              value={addSelect}
              onChange={(e) => {
                addPlayer(e.target.value);
              }}
            >
              <option value="">— Choisir un joueur —</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.jersey_number ? `#${p.jersey_number} ` : ""}
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun absent pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const p = nameById.get(r.playerId);
                return (
                  <div key={r.playerId} className="flex items-center gap-2 flex-wrap border-b last:border-0 pb-2">
                    <span className="font-medium flex-1 min-w-[140px]">
                      {p?.jersey_number ? `#${p.jersey_number} ` : ""}
                      {p?.full_name ?? "?"}
                    </span>
                    <select
                      className="input w-auto"
                      value={r.reason}
                      onChange={(e) => updateReason(r.playerId, e.target.value as AbsenceReason)}
                    >
                      {ABSENCE_REASON_ORDER.map((reason) => (
                        <option key={reason} value={reason}>
                          {ABSENCE_REASON_LABEL[reason]}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => removeRow(r.playerId)} className="text-xs text-red-600 hover:underline">
                      Retirer
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} className="btn" disabled={saving}>
              {saving ? "Enregistrement..." : rows.length === 0 ? "Aucun absent — terminer" : "Enregistrer"}
            </button>
            <button onClick={onClose} className="btn-secondary">
              Plus tard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
