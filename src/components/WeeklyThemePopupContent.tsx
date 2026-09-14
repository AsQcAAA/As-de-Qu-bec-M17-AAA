"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function WeeklyThemePopupContent({
  weekStart,
  onClose,
}: {
  weekStart: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [theme, setTheme] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("weekly_themes").upsert({ week_start: weekStart, theme }, { onConflict: "week_start" });
    setSaving(false);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Thème de la semaine</h1>
        <p className="text-slate-400 text-sm">Quel est le thème de pratique pour cette semaine ?</p>
      </div>
      <div className="card space-y-4">
        <div>
          <label className="label">Thème</label>
          <input className="input" value={theme} onChange={(e) => setTheme(e.target.value)} autoFocus />
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
