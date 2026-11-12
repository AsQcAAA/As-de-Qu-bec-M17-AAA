"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addMinutes, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import type { Player } from "@/lib/types";

interface Slot { id: string; slot_date: string; start_time: string; duration_min: number; location: string | null; player_id: string | null }

const hm = (t: string) => t.slice(0, 5).replace(":", "h");
const dayLabel = (d: string) => format(parseISO(d), "EEEE d MMMM", { locale: fr });

export default function BulletinsPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), start: "15:00", end: "17:00", duration: 15, location: "" });
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    const { data: pls } = await supabase.from("players").select("*").eq("is_call_up", false).eq("active", true).order("jersey_number");
    const list = (pls ?? []) as Player[];
    setPlayers(list);
    // Crée les liens manquants (un jeton par joueur).
    const { data: links } = await supabase.from("bulletin_links").select("player_id, token");
    const have = new Set((links ?? []).map((l) => l.player_id));
    const missing = list.filter((p) => !have.has(p.id)).map((p) => ({ player_id: p.id }));
    let all = links ?? [];
    if (missing.length) {
      await supabase.from("bulletin_links").insert(missing);
      all = (await supabase.from("bulletin_links").select("player_id, token")).data ?? [];
    }
    setTokens(Object.fromEntries(all.map((l) => [l.player_id, l.token])));
    const { data: sl } = await supabase.from("bulletin_slots").select("*").order("slot_date").order("start_time");
    setSlots((sl ?? []) as Slot[]);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    const rows: Omit<Slot, "id" | "player_id">[] = [];
    let t = parseISO(`${form.date}T${form.start}:00`);
    const end = parseISO(`${form.date}T${form.end}:00`);
    while (addMinutes(t, form.duration) <= end) {
      rows.push({ slot_date: form.date, start_time: format(t, "HH:mm:ss"), duration_min: form.duration, location: form.location.trim() || null });
      t = addMinutes(t, form.duration);
    }
    if (rows.length === 0) return;
    await supabase.from("bulletin_slots").upsert(rows, { onConflict: "slot_date,start_time", ignoreDuplicates: true });
    load();
  }
  async function removeSlot(id: string) { await supabase.from("bulletin_slots").delete().eq("id", id); load(); }
  async function release(id: string) { await supabase.from("bulletin_slots").update({ player_id: null, booked_at: null }).eq("id", id); load(); }

  const nameOf = useMemo(() => new Map(players.map((p) => [p.id, p.full_name])), [players]);
  const slotOf = useMemo(() => new Map(slots.filter((s) => s.player_id).map((s) => [s.player_id!, s])), [slots]);
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) m.set(s.slot_date, [...(m.get(s.slot_date) ?? []), s]);
    return [...m];
  }, [slots]);

  const link = (p: Player) => `${typeof window === "undefined" ? "" : window.location.origin}/rendez-vous/${tokens[p.id] ?? ""}`;
  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }
  const unbooked = players.filter((p) => !slotOf.has(p.id));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Rencontres bulletins</h1>
      <p className="text-sm opacity-70">Crée des plages de créneaux, puis puis envoyez le courriel aux familles (onglet « Envoyer un courriel » → Rencontres bulletins) : chaque famille reçoit son lien personnel et ne voit jamais les autres joueurs.</p>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Ajouter des créneaux</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">Date<br /><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
          <label className="text-sm">Début<br /><input type="time" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
          <label className="text-sm">Fin<br /><input type="time" className="input" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
          <label className="text-sm">Durée (min)<br /><input type="number" min={5} step={5} className="input w-24" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) || 15 })} /></label>
          <label className="text-sm">Lieu (optionnel)<br /><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <button onClick={generate} className="btn">Créer les créneaux</button>
        </div>
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-semibold">Horaire ({slots.filter((s) => s.player_id).length} réservés / {slots.length})</h2>
        {byDay.length === 0 && <p className="text-sm opacity-60">Aucun créneau pour l&apos;instant.</p>}
        {byDay.map(([d, list]) => (
          <div key={d}>
            <h3 className="font-medium capitalize mb-1">{dayLabel(d)}</h3>
            <ul className="text-sm divide-y divide-white/10">
              {list.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-1">
                  <span className="w-14 font-mono">{hm(s.start_time)}</span>
                  <span className={s.player_id ? "font-semibold" : "opacity-50"}>{s.player_id ? nameOf.get(s.player_id) ?? "Joueur" : "libre"}</span>
                  <span className="ml-auto flex gap-3">
                    {s.player_id && <button className="underline opacity-70" onClick={() => release(s.id)}>Libérer</button>}
                    <button className="underline opacity-70" onClick={() => removeSlot(s.id)}>Supprimer</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Liens des joueurs ({unbooked.length} sans rendez-vous)</h2>
          <button className="btn-secondary" onClick={() => copy(players.map((p) => `${p.full_name} : ${link(p)}`).join("\n"), "all")}>
            {copied === "all" ? "Copié ✓" : "Copier tous les liens"}
          </button>
        </div>
        <ul className="text-sm divide-y divide-white/10">
          {players.map((p) => {
            const s = slotOf.get(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 py-1.5 flex-wrap">
                <span className="w-44">{p.full_name}</span>
                <span className={s ? "text-emerald-400" : "text-amber-400"}>{s ? `${format(parseISO(s.slot_date), "d MMM", { locale: fr })} · ${hm(s.start_time)}` : "à réserver"}</span>
                <button className="ml-auto underline" onClick={() => copy(`Bonjour, réservez la rencontre bulletin de ${p.full_name.split(" ")[0]} (15 min) ici : ${link(p)}`, p.id)}>
                  {copied === p.id ? "Copié ✓" : "Copier le message"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
