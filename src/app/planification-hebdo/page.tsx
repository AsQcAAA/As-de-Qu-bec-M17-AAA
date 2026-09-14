"use client";

import { useEffect, useState } from "react";
import { addDays, format, isSameWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import type { WeeklyTheme } from "@/lib/types";

// Même ancrage que le tableau de bord : la semaine du 31 août 2026 est la
// semaine #1 de la saison. On couvre jusqu'à fin avril (Coupe Chevrolet) —
// à ajuster une fois les dates exactes de la coupe connues.
const WEEK_1_START = new Date(2026, 7, 31);
const SEASON_END = new Date(2027, 3, 30);

function buildWeeks() {
  const weeks: Date[] = [];
  for (let d = new Date(WEEK_1_START); d <= SEASON_END; d = addDays(d, 7)) {
    weeks.push(new Date(d));
  }
  return weeks;
}

export default function PlanificationHebdoPage() {
  const supabase = createClient();
  const weeks = buildWeeks();
  const [themes, setThemes] = useState<Record<string, WeeklyTheme>>({});
  const [drafts, setDrafts] = useState<Record<string, { theme: string; notes: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("weekly_themes")
      .select("*")
      .gte("week_start", format(WEEK_1_START, "yyyy-MM-dd"))
      .lte("week_start", format(SEASON_END, "yyyy-MM-dd"));
    const byWeek: Record<string, WeeklyTheme> = {};
    for (const t of data ?? []) byWeek[t.week_start] = t;
    setThemes(byWeek);
    const nextDrafts: Record<string, { theme: string; notes: string }> = {};
    for (const w of weeks) {
      const key = format(w, "yyyy-MM-dd");
      const existing = byWeek[key];
      nextDrafts[key] = { theme: existing?.theme ?? "", notes: existing?.notes ?? "" };
    }
    setDrafts(nextDrafts);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(weekStart: string) {
    setSaving(weekStart);
    const draft = drafts[weekStart];
    await supabase
      .from("weekly_themes")
      .upsert({ week_start: weekStart, theme: draft.theme || null, notes: draft.notes || null }, { onConflict: "week_start" });
    setSaving(null);
    load();
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Planification hebdomadaire</h1>
        <p className="text-slate-400 text-sm">
          Un thème et des notes pour chaque semaine de la saison, du 31 août à la Coupe Chevrolet en avril.
        </p>
      </div>

      <div className="space-y-3">
        {weeks.map((w, i) => {
          const key = format(w, "yyyy-MM-dd");
          const weekEnd = addDays(w, 6);
          const current = isSameWeek(w, new Date(), { weekStartsOn: 1 });
          const draft = drafts[key] ?? { theme: "", notes: "" };
          return (
            <div
              key={key}
              className={`card space-y-2 ${current ? "border-gold-400 ring-2 ring-gold-400/40" : ""}`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-semibold">
                  Semaine #{i + 1} — {format(w, "d MMM", { locale: fr })} au {format(weekEnd, "d MMM yyyy", { locale: fr })}
                  {current && <span className="ml-2 badge bg-gold-100 text-ink-800">En cours</span>}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Thème</label>
                  <input
                    className="input"
                    value={draft.theme}
                    onChange={(e) => setDrafts({ ...drafts, [key]: { ...draft, theme: e.target.value } })}
                  />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    className="input"
                    rows={1}
                    value={draft.notes}
                    onChange={(e) => setDrafts({ ...drafts, [key]: { ...draft, notes: e.target.value } })}
                  />
                </div>
              </div>
              <button className="btn-secondary text-sm" onClick={() => save(key)} disabled={saving === key}>
                {saving === key ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
