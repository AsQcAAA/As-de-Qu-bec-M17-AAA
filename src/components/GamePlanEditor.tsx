"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Game } from "@/lib/types";

/** Les 4 points clés du plan de match, conservés avec le match. */
export default function GamePlanEditor({ game, onSaved }: { game: Game; onSaved?: () => void }) {
  const supabase = createClient();
  const [form, setForm] = useState({
    plan_point_1: game.plan_point_1 ?? "",
    plan_point_2: game.plan_point_2 ?? "",
    plan_point_3: game.plan_point_3 ?? "",
    plan_point_4: game.plan_point_4 ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase
      .from("games")
      .update({
        plan_point_1: form.plan_point_1 || null,
        plan_point_2: form.plan_point_2 || null,
        plan_point_3: form.plan_point_3 || null,
        plan_point_4: form.plan_point_4 || null,
      })
      .eq("id", game.id);
    setSaving(false);
    onSaved?.();
  }

  return (
    <form onSubmit={save} className="space-y-2">
      {([1, 2, 3, 4] as const).map((n) => (
        <div key={n} className="flex gap-2 items-start">
          <span className="mt-2 h-6 w-6 shrink-0 rounded-full bg-gold-500 text-ink-900 text-xs font-bold flex items-center justify-center">
            {n}
          </span>
          <input
            className="input"
            placeholder={`Point clé ${n}`}
            value={form[`plan_point_${n}` as keyof typeof form]}
            onChange={(e) => setForm({ ...form, [`plan_point_${n}`]: e.target.value })}
          />
        </div>
      ))}
      <button type="submit" className="btn" disabled={saving}>
        {saving ? "Enregistrement..." : "Enregistrer le plan de match"}
      </button>
    </form>
  );
}
