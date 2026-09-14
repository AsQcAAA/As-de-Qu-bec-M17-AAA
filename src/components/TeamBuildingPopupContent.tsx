"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TeamBuildingPopupContent({
  logDate,
  onClose,
}: {
  logDate: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [theme, setTheme] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("team_building_log").upsert({ log_date: logDate, theme, notes }, { onConflict: "log_date" });
    setSaving(false);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Team Building</h1>
        <p className="text-slate-400 text-sm">Quel était le thème de l'activité Team Building d'aujourd'hui ?</p>
      </div>
      <div className="card space-y-4">
        <div>
          <label className="label">Thème</label>
          <input className="input" value={theme} onChange={(e) => setTheme(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Plus tard
          </button>
        </div>
      </div>
    </form>
  );
}
