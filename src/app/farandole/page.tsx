"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toPng } from "html-to-image";
import { createClient } from "@/lib/supabase/client";
import JerseySlot from "@/components/JerseySlot";
import { lastName } from "@/lib/players";
import type { FarandoleAssignment, Player } from "@/lib/types";

const SLOT_COUNT = 6;

/**
 * Dates exactes du projet Farandole, fournies par le coach.
 *
 * On ne les déduit plus des vendredis de la saison : la liste comporte des
 * sauts (semaines de congé, tournois) qu'aucune règle calculée ne reproduirait.
 * Toutes ces dates sont des vendredis.
 */
const FARANDOLE_DATES = [
  "2026-09-11",
  "2026-09-25",
  "2026-10-02",
  "2026-10-09",
  "2026-10-16",
  "2026-10-23",
  "2026-10-30",
  "2026-11-13",
  "2026-11-27",
  "2027-01-08",
  "2027-01-15",
  "2027-01-22",
  "2027-02-12",
  "2027-02-26",
  "2027-03-12",
  "2027-03-19",
];

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
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={assignedPlayers.length === 0 || exportingDate === dateKey}
                  onClick={() => exportDateImage(dateKey)}
                >
                  {exportingDate === dateKey ? "Génération..." : "⬇ Exporter en PNG"}
                </button>
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
            <div
              key={dateKey}
              ref={(el) => {
                exportRefs.current[dateKey] = el;
              }}
              className="w-[600px] bg-ink-900 p-8 space-y-5"
            >
              <div className="text-center space-y-1">
                <div className="text-xs font-black uppercase tracking-widest text-gold-400">Farandole</div>
                <h2 className="text-2xl font-black capitalize text-white">
                  {format(day, "EEEE d MMMM yyyy", { locale: fr })}
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-4 justify-items-center pt-2">
                {assignedPlayers.map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-1.5 w-28">
                    <div className="relative h-16 w-16 shrink-0">
                      <div className="h-16 w-16 rounded-full bg-gold-500 text-ink-900 text-2xl font-black flex items-center justify-center border-2 border-gold-300 overflow-hidden">
                        {p.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photo_url} alt={p.full_name} className="h-full w-full object-cover" />
                        ) : (
                          p.jersey_number ?? "?"
                        )}
                      </div>
                      <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-ink-900 text-gold-400 text-xs font-black flex items-center justify-center border-2 border-gold-300">
                        {p.jersey_number ?? "?"}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-white text-center leading-tight">
                      {lastName(p.full_name)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
