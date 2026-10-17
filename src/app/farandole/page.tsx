"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toPng } from "html-to-image";
import { createClient } from "@/lib/supabase/client";
import JerseySlot from "@/components/JerseySlot";
import { lastName } from "@/lib/players";
import { FARANDOLE_DATES } from "@/lib/farandole";
import FarandoleExportPanel from "@/components/FarandoleExportPanel";
import type { FarandoleAssignment, Player } from "@/lib/types";

const SLOT_COUNT = 6;

function farandoleDays(): Date[] {
  return FARANDOLE_DATES.map((d) => new Date(`${d}T12:00:00`));
}

export default function FarandolePage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [assignments, setAssignments] = useState<Record<string, FarandoleAssignment>>({});
  const [loading, setLoading] = useState(true);
  const [exportingDate, setExportingDate] = useState<string | null>(null);
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const dates = farandoleDays();

  async function load() {
    const [{ data: pls }, { data: rows }] = await Promise.all([
      supabase.from("players").select("*").eq("active", true).eq("is_call_up", false).order("jersey_number"),
      supabase.from("farandole_assignments").select("*"),
    ]);
    setPlayers(pls ?? []);
    setAssignments(Object.fromEntries((rows ?? []).map((r) => [r.assignment_date, r])));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setSlot(dateKey: string, index: number, playerId: string) {
    const existing = assignments[dateKey]?.player_ids ?? [];
    const current = [...existing];
    while (current.length < SLOT_COUNT) current.push("");
    current[index] = playerId;
    const newIds = current.filter(Boolean);
    setAssignments({
      ...assignments,
      [dateKey]: { assignment_date: dateKey, player_ids: newIds, updated_at: new Date().toISOString() },
    });
    await supabase
      .from("farandole_assignments")
      .upsert({ assignment_date: dateKey, player_ids: newIds }, { onConflict: "assignment_date" });
  }

  /** Copie la farandole d'une journée vers une autre (remplace la cible). */
  async function replicate(fromKey: string, toKey: string) {
    const ids = assignments[fromKey]?.player_ids ?? [];
    if (!toKey || ids.length === 0) return;
    const target = assignments[toKey]?.player_ids ?? [];
    if (target.length > 0 && !window.confirm("Cette journée a déjà des joueurs. Les remplacer ?")) return;
    setAssignments({
      ...assignments,
      [toKey]: { assignment_date: toKey, player_ids: [...ids], updated_at: new Date().toISOString() },
    });
    await supabase
      .from("farandole_assignments")
      .upsert({ assignment_date: toKey, player_ids: [...ids] }, { onConflict: "assignment_date" });
  }

  async function exportDateImage(dateKey: string) {
    const node = exportRefs.current[dateKey];
    if (!node) return;
    setExportingDate(dateKey);
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: "#0d0c0c" });
      const link = document.createElement("a");
      link.download = `farandole-${dateKey}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExportingDate(null);
    }
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  const tally = new Map<string, number>();
  for (const a of Object.values(assignments)) {
    for (const id of a.player_ids) tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  const tallyRows = players
    .map((p) => ({ player: p, count: tally.get(p.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Farandole</h1>
        <p className="text-slate-400 text-sm">
          Jusqu&apos;à {SLOT_COUNT} joueurs M17 envoyés coacher à la Farandole, aux {FARANDOLE_DATES.length} dates de la saison.
        </p>
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold">Compilation — nombre de fois assigné</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
          {tallyRows.map(({ player, count }) => (
            <div key={player.id} className="flex items-center justify-between border-b border-slate-100 pb-0.5">
              <span>
                #{player.jersey_number ?? "?"} {lastName(player.full_name)}
              </span>
              <span className="font-semibold text-ink-800">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-4">
        {dates.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const a = assignments[dateKey];
          const slotValues = Array.from({ length: SLOT_COUNT }, (_, i) => a?.player_ids[i] ?? "");
          const selected = new Set(a?.player_ids ?? []);
          const assignedPlayers = slotValues
            .filter(Boolean)
            .map((id) => players.find((p) => p.id === id))
            .filter((p): p is Player => !!p);
          return (
            <section key={dateKey} className="card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold capitalize">{format(day, "EEEE d MMMM yyyy", { locale: fr })}</h2>
                <div className="flex items-center gap-2">
                <select
                  className="input text-xs"
                  value=""
                  disabled={assignedPlayers.length === 0}
                  onChange={(e) => replicate(dateKey, e.target.value)}
                  title="Copier cette farandole vers une autre journée"
                >
                  <option value="">📋 Répliquer vers…</option>
                  {dates
                    .filter((d) => format(d, "yyyy-MM-dd") !== dateKey)
                    .map((d) => (
                      <option key={d.toISOString()} value={format(d, "yyyy-MM-dd")}>
                        {format(d, "EEE d MMM yyyy", { locale: fr })}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={assignedPlayers.length === 0 || exportingDate === dateKey}
                  onClick={() => exportDateImage(dateKey)}
                >
                  {exportingDate === dateKey ? "Génération..." : "⬇ Exporter en PNG"}
                </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {slotValues.map((value, i) => {
                  const options = players.filter((p) => p.id === value || !selected.has(p.id));
                  return (
                    <JerseySlot key={i} value={value} onChange={(id) => setSlot(dateKey, i, id)} options={options} />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Panneaux d'export, rendus hors écran : une image propre par vendredi,
          sans les menus déroulants, prête à publier telle quelle. */}
      <div className="fixed -left-[9999px] top-0" aria-hidden>
        {dates.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const a = assignments[dateKey];
          const assignedPlayers = (a?.player_ids ?? [])
            .map((id) => players.find((p) => p.id === id))
            .filter((p): p is Player => !!p);
          return (
            <FarandoleExportPanel
              key={dateKey}
              day={day}
              players={assignedPlayers}
              panelRef={(el) => {
                exportRefs.current[dateKey] = el;
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
