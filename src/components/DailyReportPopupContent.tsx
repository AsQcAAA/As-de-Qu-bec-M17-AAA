"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { isNoPracticeDay } from "@/lib/dayType";
import { useCoachDirectory } from "@/lib/useCoach";
import type { DailyReport } from "@/lib/types";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

const emptyForm = {
  meeting_theme: "",
  practice_theme: "",
  coach_notes: "",
};

export default function DailyReportPopupContent({
  existing,
  onClose,
}: {
  existing: DailyReport | null;
  onClose: () => void;
}) {
  const supabase = createClient();
  const { myId } = useCoachDirectory();
  const [form, setForm] = useState(
    existing
      ? {
          meeting_theme: existing.meeting_theme ?? "",
          practice_theme: existing.practice_theme ?? "",
          coach_notes: existing.coach_notes ?? "",
        }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const noPractice = isNoPracticeDay(todayStr());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase
      .from("daily_reports")
      .upsert({ report_date: todayStr(), ...form, updated_by: myId }, { onConflict: "report_date" });
    setSaving(false);
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Rapport quotidien</h1>
        <p className="text-slate-400 text-sm">{format(new Date(), "EEEE d MMMM")} — pratique du jour.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Thème du meeting</label>
          <input
            className="input"
            value={form.meeting_theme}
            onChange={(e) => setForm({ ...form, meeting_theme: e.target.value })}
          />
        </div>
        {!noPractice && (
        <div>
          <label className="label">Thème de la pratique</label>
          <input
            className="input"
            value={form.practice_theme}
            onChange={(e) => setForm({ ...form, practice_theme: e.target.value })}
          />
        </div>
        )}
        <div>
          <label className="label">Notes (optionnel)</label>
          <textarea
            className="input"
            rows={2}
            value={form.coach_notes}
            onChange={(e) => setForm({ ...form, coach_notes: e.target.value })}
          />
        </div>

        {saved ? (
          <div className="flex gap-2">
            <Link href={`/jour/${todayStr()}`} className="btn" onClick={onClose}>
              Aller à l'horaire et l'alignement du jour →
            </Link>
            <button type="button" onClick={onClose} className="btn-secondary">
              Fermer
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer le rapport"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Plus tard
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
