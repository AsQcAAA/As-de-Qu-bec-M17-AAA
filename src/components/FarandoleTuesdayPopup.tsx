"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { toPng } from "html-to-image";
import { lastName } from "@/lib/players";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/Modal";
import FarandoleExportPanel from "@/components/FarandoleExportPanel";
import { FARANDOLE_DATES } from "@/lib/farandole";
import type { Player } from "@/lib/types";

const DISMISS_KEY = "farandole-popup-dismissed-";

/**
 * Le mardi matin : si le vendredi de la semaine est un vendredi Farandole et que
 * des joueurs y sont assignés, propose de télécharger l'image à publier.
 * Ne s'affiche qu'une fois par mardi (« Plus tard » ou téléchargement).
 */
export default function FarandoleTuesdayPopup() {
  const supabase = createClient();
  const [data, setData] = useState<{ friday: Date; dateKey: string; players: Player[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** Raccourci : changer les joueurs directement depuis le pop-up. */
  const [editing, setEditing] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  /** Toutes les assignations (date → joueurs) pour le récapitulatif « nombre de fois ». */
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});

  async function startEditing() {
    setEditing(true);
    if (allPlayers.length === 0) {
      const [{ data: pls }, { data: rows }] = await Promise.all([
        supabase.from("players").select("*").eq("active", true).eq("is_call_up", false).order("jersey_number"),
        supabase.from("farandole_assignments").select("assignment_date, player_ids"),
      ]);
      setAllPlayers(pls ?? []);
      setAssignments(Object.fromEntries((rows ?? []).map((r) => [r.assignment_date as string, (r.player_ids ?? []) as string[]])));
    }
  }

  async function setSlot(index: number, playerId: string) {
    if (!data) return;
    const slots = Array.from({ length: 6 }, (_, i) => data.players[i]?.id ?? "");
    slots[index] = playerId;
    const ids = slots.filter(Boolean);
    const players = ids.map((id) => allPlayers.find((p) => p.id === id)).filter((p): p is Player => !!p);
    setData({ ...data, players });
    setAssignments((prev) => ({ ...prev, [data.dateKey]: ids }));
    await supabase.from("farandole_assignments").upsert({ assignment_date: data.dateKey, player_ids: ids }, { onConflict: "assignment_date" });
  }

  useEffect(() => {
    const now = new Date();
    if (now.getDay() !== 2 || now.getHours() >= 12) return;
    const todayKey = format(now, "yyyy-MM-dd");
    try {
      if (localStorage.getItem(DISMISS_KEY + todayKey) === "1") return;
    } catch {}
    const friday = addDays(startOfWeek(now, { weekStartsOn: 1 }), 4);
    const dateKey = format(friday, "yyyy-MM-dd");
    if (!FARANDOLE_DATES.includes(dateKey)) return;
    (async () => {
      const { data: a } = await supabase.from("farandole_assignments").select("player_ids").eq("assignment_date", dateKey).maybeSingle();
      const ids: string[] = a?.player_ids ?? [];
      const { data: pls } = ids.length ? await supabase.from("players").select("*").in("id", ids) : { data: [] as Player[] };
      const players = ids.map((id) => (pls ?? []).find((p) => p.id === id)).filter((p): p is Player => !!p);
      setData({ friday: new Date(`${dateKey}T12:00:00`), dateKey, players });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY + format(new Date(), "yyyy-MM-dd"), "1");
    } catch {}
    setData(null);
  }

  async function download() {
    if (!panelRef.current || !data) return;
    setBusy(true);
    try {
      const url = await toPng(panelRef.current, { pixelRatio: 2, backgroundColor: "#0d0c0c" });
      const link = document.createElement("a");
      link.download = `farandole-${data.dateKey}.png`;
      link.href = url;
      link.click();
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;

  const tally = new Map<string, number>();
  for (const ids of Object.values(assignments)) for (const id of ids) tally.set(id, (tally.get(id) ?? 0) + 1);
  const recap = allPlayers.map((player) => ({ player, count: tally.get(player.id) ?? 0 })).sort((a, b) => b.count - a.count || (a.player.jersey_number ?? 0) - (b.player.jersey_number ?? 0));

  return (
    <Modal onClose={dismiss}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Farandole de vendredi</h1>
          <p className="text-slate-400 text-sm capitalize">
            {format(data.friday, "EEEE d MMMM yyyy", { locale: fr })}
            {data.players.length > 0 && ` — ${data.players.length} joueur${data.players.length > 1 ? "s" : ""}`}
          </p>
        </div>
        {data.players.length > 0 ? (
          <div className="overflow-x-auto">
            <FarandoleExportPanel day={data.friday} players={data.players} panelRef={(el) => (panelRef.current = el)} />
          </div>
        ) : (
          <p className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">
            Aucun joueur n&apos;est encore assigné à la Farandole de vendredi.
          </p>
        )}
        {editing && (
          <div className="rounded-xl bg-white/5 p-3 space-y-1.5">
            <div className="text-xs font-bold uppercase tracking-widest text-gold-400">Nombre de fois assigné</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-sm text-slate-200">
              {recap.map(({ player, count }) => (
                <div key={player.id} className="flex items-center justify-between border-b border-white/10 py-0.5">
                  <span>
                    #{player.jersey_number ?? "?"} {lastName(player.full_name)}
                  </span>
                  <span className="font-bold text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {editing && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => {
              const value = data.players[i]?.id ?? "";
              const taken = new Set(data.players.map((p) => p.id));
              return (
                <select key={i} className="input text-sm" value={value} onChange={(e) => setSlot(i, e.target.value)}>
                  <option value="">— Vide —</option>
                  {allPlayers
                    .filter((p) => p.id === value || !taken.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.jersey_number ?? "?"} {p.full_name} — {tally.get(p.id) ?? 0} fois
                      </option>
                    ))}
                </select>
              );
            })}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" onClick={() => (editing ? setEditing(false) : startEditing())}>
            {editing ? "Terminer les modifications" : "Modifier les joueurs"}
          </button>
          {data.players.length > 0 ? (
            <button className="btn" onClick={download} disabled={busy}>
              {busy ? "Génération..." : "⬇ Télécharger l'image"}
            </button>
          ) : (
            <Link href="/farandole" className="btn" onClick={dismiss}>
              Assigner les joueurs
            </Link>
          )}
          <button className="btn-secondary" onClick={dismiss}>
            Plus tard
          </button>
        </div>
      </div>
    </Modal>
  );
}
