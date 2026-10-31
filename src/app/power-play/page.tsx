"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { FormationStatic } from "@/components/FormationMap";
import { PP_COLORS } from "@/components/PowerPlayLineups";
import { lastName } from "@/lib/players";
import { PP_COLOR_LABEL, emptyMap, loadUnits, unitHref, type PpColor, type PpUnit } from "@/lib/ppUnits";
import type { Player } from "@/lib/types";

const COLOR_FILL: Record<PpColor, string> = { gris: PP_COLORS.pp1.fill, jaune: PP_COLORS.pp2.fill, bleu: PP_COLORS.pp3.fill };

export default function PowerPlayPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<PpUnit[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  /** Titres personnalisés par date (remplacent la date affichée en en-tête de groupe). */
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ date: string; value: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ date: string; label: string; color: PpColor | "" }>({ date: format(new Date(), "yyyy-MM-dd"), label: "", color: "" });

  async function load() {
    const [{ units: us, error: e1 }, { data: pls }, { data: tts }] = await Promise.all([
      loadUnits(supabase),
      supabase.from("players").select("*").eq("active", true).neq("position", "G").order("jersey_number"),
      supabase.from("pp_date_titles").select("unit_date, title"),
    ]);
    setTitles(Object.fromEntries((tts ?? []).map((t) => [t.unit_date as string, t.title as string])));
    if (e1) setError("L'onglet n'est pas prêt (migrations 051 et 052 à exécuter).");
    setUnits(us);
    setPlayers((pls ?? []) as Player[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const names = useMemo(
    () => Object.fromEntries(players.filter((p) => p.jersey_number != null).map((p) => [String(p.jersey_number), lastName(p.full_name)])),
    [players]
  );
  const byDate = useMemo(() => {
    const m = new Map<string, PpUnit[]>();
    for (const u of units) m.set(u.date, [...(m.get(u.date) ?? []), u]);
    for (const list of m.values()) list.sort((a, b) => a.label.localeCompare(b.label));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [units]);

  async function saveTitle() {
    if (!editing) return;
    const title = editing.value.trim();
    const { date } = editing;
    const { error: err } = title
      ? await supabase.from("pp_date_titles").upsert({ unit_date: date, title, updated_at: new Date().toISOString() }, { onConflict: "unit_date" })
      : await supabase.from("pp_date_titles").delete().eq("unit_date", date);
    if (err) {
      setError(err.message);
      return;
    }
    setTitles((t) => {
      const n = { ...t };
      if (title) n[date] = title;
      else delete n[date];
      return n;
    });
    setEditing(null);
  }

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const label = form.label.trim() || "Unité";
    const { error: err } = await supabase
      .from("pp_units")
      .upsert({ unit_date: form.date, label, color: form.color || null, kind: "inzone", map: emptyMap() }, { onConflict: "unit_date,label", ignoreDuplicates: true });
    if (err) {
      setError(err.message);
      return;
    }
    setForm({ ...form, label: "" });
    setShowForm(false);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Power Play</h1>
          <p className="text-slate-400 text-sm">
            Tes unités par date. Clique une unité pour ouvrir sa page : in-zone, breakout et faceoff. Les unités saisies dans
            l&apos;alignement du jour s&apos;ajoutent ici toutes seules.
          </p>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Annuler" : "+ Nouvelle unité"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addUnit} className="card grid gap-3 sm:grid-cols-3 items-end">
          <div>
            <label className="label">Date</label>
            <input type="date" required className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Nom (ex. PP1)</label>
            <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Unité" />
          </div>
          <div>
            <label className="label">Chandail</label>
            <select className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value as PpColor | "" })}>
              <option value="">—</option>
              {(Object.keys(PP_COLOR_LABEL) as PpColor[]).map((c) => (
                <option key={c} value={c}>
                  {PP_COLOR_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className="btn">
              Créer l&apos;unité
            </button>
          </div>
        </form>
      )}

      {error && <p className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">{error}</p>}

      {loading ? (
        <p className="text-slate-300">Chargement...</p>
      ) : byDate.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune unité pour l&apos;instant. Crée-en une, ou saisis un power play dans l&apos;alignement du jour.</p>
      ) : (
        byDate.map(([date, list]) => (
          <section key={date} className="space-y-2">
            {editing?.date === date ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveTitle();
                }}
              >
                <input
                  autoFocus
                  className="input w-auto min-w-[16rem] text-sm"
                  value={editing.value}
                  onChange={(e) => setEditing({ date, value: e.target.value })}
                  placeholder="Ex. Power play pré-tournoi #1 (vide = date)"
                />
                <button type="submit" className="btn">Enregistrer</button>
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Annuler</button>
              </form>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-lg font-bold text-white">{titles[date] ?? <span className="capitalize">{format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}</span>}</h2>
                {titles[date] && <span className="text-xs capitalize text-slate-400">{format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}</span>}
                <button className="text-xs font-semibold text-gold-400 hover:underline" onClick={() => setEditing({ date, value: titles[date] ?? "" })}>
                  ✎ Renommer
                </button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((u) => (
                <Link key={u.key} href={unitHref(u)} className="card space-y-2 transition hover:ring-2 hover:ring-gold-400">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">
                      {u.label}
                      {u.color ? ` · ${PP_COLOR_LABEL[u.color].toLowerCase()}` : ""}
                    </h3>
                    <span className="flex gap-1 text-[10px] font-black uppercase">
                      <span className="rounded bg-gold-100 px-1.5 py-0.5 text-gold-800">In-zone</span>
                      <span className={`rounded px-1.5 py-0.5 ${u.breakout ? "bg-gold-100 text-gold-800" : "bg-slate-100 text-slate-400"}`}>BO</span>
                      <span className={`rounded px-1.5 py-0.5 ${u.faceoff ? "bg-gold-100 text-gold-800" : "bg-slate-100 text-slate-400"}`}>FO</span>
                    </span>
                  </div>
                  <FormationStatic kind="pp" value={{ ...u.inzone, note: "" }} names={names} markerColor={u.color ? COLOR_FILL[u.color] : undefined} />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
