"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import FormationMap, { FormationStatic, type FormationValue } from "@/components/FormationMap";
import { PP_COLORS } from "@/components/PowerPlayLineups";
import { lastName } from "@/lib/players";
import type { Player } from "@/lib/types";

type Kind = "inzone" | "breakout" | "faceoff";
type Color = "gris" | "jaune" | "bleu";

const KIND_LABEL: Record<Kind, string> = { inzone: "In-zone", breakout: "Breakout", faceoff: "Faceoff" };
const COLOR_FILL: Record<Color, string> = { gris: PP_COLORS.pp1.fill, jaune: PP_COLORS.pp2.fill, bleu: PP_COLORS.pp3.fill };
const COLOR_LABEL: Record<Color, string> = { gris: "Gris", jaune: "Jaune", bleu: "Bleu" };
const FORMATION_KIND: Record<Kind, "pp" | "bo" | "fo"> = { inzone: "pp", breakout: "bo", faceoff: "fo" };
const empty = (): FormationValue => ({ markers: [], note: "" });

interface Entry {
  key: string;
  date: string;
  label: string;
  kind: Kind;
  color: Color | null;
  map: FormationValue;
  /** « unit » = créée ici (modifiable) ; « lineup » = saisie dans l'alignement du jour (lecture, lien vers le jour). */
  source: "unit" | "lineup";
  id?: string;
}

export default function PowerPlayPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Entry[]>([]);
  const [fromLineups, setFromLineups] = useState<Entry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ date: string; label: string; kind: Kind; color: Color | "" }>({
    date: format(new Date(), "yyyy-MM-dd"),
    label: "",
    kind: "inzone",
    color: "",
  });
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function load() {
    const [{ data: us, error: e1 }, { data: lus }, { data: pls }] = await Promise.all([
      supabase.from("pp_units").select("*").order("unit_date", { ascending: false }).order("created_at", { ascending: true }),
      supabase.from("lineups").select("lineup_date, pp1_map, pp2_map, pp3_map").order("lineup_date", { ascending: false }),
      supabase.from("players").select("*").eq("active", true).neq("position", "G").order("jersey_number"),
    ]);
    if (e1) setError("L'onglet n'est pas encore prêt (migration 051 à exécuter).");
    setUnits(
      (us ?? []).map((u) => ({
        key: `u-${u.id}`,
        id: u.id as string,
        date: u.unit_date as string,
        label: u.label as string,
        kind: u.kind as Kind,
        color: (u.color as Color | null) ?? null,
        map: (u.map as FormationValue) ?? empty(),
        source: "unit" as const,
      }))
    );
    const fl: Entry[] = [];
    for (const l of lus ?? []) {
      ([["pp1_map", "PP1", "gris"], ["pp2_map", "PP2", "jaune"], ["pp3_map", "PP3", "bleu"]] as const).forEach(([k, label, color]) => {
        const m = (l as Record<string, FormationValue | null>)[k];
        const markers = (m?.markers ?? []).filter((x) => x.number !== "");
        if (m && markers.length > 0) {
          fl.push({ key: `l-${l.lineup_date}-${k}`, date: l.lineup_date as string, label, kind: "inzone", color, map: { ...m, markers }, source: "lineup" });
        }
      });
    }
    setFromLineups(fl);
    setPlayers((pls ?? []) as Player[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roster = useMemo(
    () => players.filter((p) => p.jersey_number != null).map((p) => ({ number: String(p.jersey_number), name: lastName(p.full_name) })),
    [players]
  );
  const names = useMemo(() => Object.fromEntries(roster.map((r) => [r.number, r.name])), [roster]);

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from("pp_units").insert({
      unit_date: form.date,
      label: form.label.trim() || KIND_LABEL[form.kind],
      kind: form.kind,
      color: form.color || null,
      map: empty(),
    });
    if (err) {
      setError(err.message);
      return;
    }
    setForm({ ...form, label: "" });
    setShowForm(false);
    await load();
  }

  function saveMap(entry: Entry, map: FormationValue) {
    setUnits((prev) => prev.map((u) => (u.key === entry.key ? { ...u, map } : u)));
    clearTimeout(timers.current[entry.key]);
    timers.current[entry.key] = setTimeout(() => {
      supabase.from("pp_units").update({ map }).eq("id", entry.id!).then(() => {});
    }, 500);
  }

  async function removeUnit(entry: Entry) {
    if (!window.confirm(`Supprimer l'unité « ${entry.label} » du ${entry.date} ?`)) return;
    await supabase.from("pp_units").delete().eq("id", entry.id!);
    await load();
  }

  const entries = useMemo(() => {
    const all = [...units, ...fromLineups].filter((e) => filter === "all" || e.kind === filter);
    const byDate = new Map<string, Entry[]>();
    for (const e of all) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [units, fromLineups, filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Power Play</h1>
          <p className="text-slate-400 text-sm">
            Tes unités d&apos;avantage numérique par date : en zone, sortie de zone (breakout) et mise au jeu (faceoff). Les unités
            saisies dans l&apos;alignement du jour s&apos;ajoutent ici toutes seules, avec leur date.
          </p>
        </div>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Annuler" : "+ Nouvelle unité"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addUnit} className="card grid gap-3 sm:grid-cols-4 items-end">
          <div>
            <label className="label">Date</label>
            <input type="date" required className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Nom (ex. PP1)</label>
            <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={KIND_LABEL[form.kind]} />
          </div>
          <div>
            <label className="label">Chandail</label>
            <select className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value as Color | "" })}>
              <option value="">—</option>
              {(Object.keys(COLOR_LABEL) as Color[]).map((c) => (
                <option key={c} value={c}>
                  {COLOR_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-4">
            <button type="submit" className="btn">
              Créer l&apos;unité
            </button>
          </div>
        </form>
      )}

      {error && <p className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">{error}</p>}

      <div className="inline-flex overflow-hidden rounded-lg border border-white/20 text-sm font-bold">
        {(["all", "inzone", "breakout", "faceoff"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-2 ${filter === k ? "bg-gold-500 text-ink-900" : "bg-white/5 text-slate-200 hover:bg-white/10"}`}
          >
            {k === "all" ? "Tous" : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-slate-300">Chargement...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune unité pour l&apos;instant. Crée-en une, ou saisis un power play dans l&apos;alignement du jour.</p>
      ) : (
        entries.map(([date, list]) => (
          <section key={date} className="space-y-2">
            <h2 className="text-lg font-bold capitalize text-white">{format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}</h2>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {list.map((e) =>
                e.source === "unit" ? (
                  <div key={e.key} className="space-y-1">
                    <FormationMap
                      kind={FORMATION_KIND[e.kind]}
                      title={`${e.label} — ${KIND_LABEL[e.kind]}${e.color ? ` · ${COLOR_LABEL[e.color].toLowerCase()}` : ""}`}
                      subtitle={e.kind === "breakout" ? "Sortie de zone, glace complète (notre zone en bas)." : e.kind === "faceoff" ? "Mise au jeu en zone offensive." : "Zone offensive, but en haut."}
                      value={e.map}
                      onChange={(v) => saveMap(e, v)}
                      roster={roster}
                      markerColor={e.color ? COLOR_FILL[e.color] : undefined}
                    />
                    <button className="text-xs text-red-400 hover:underline" onClick={() => removeUnit(e)}>
                      Supprimer cette unité
                    </button>
                  </div>
                ) : (
                  <div key={e.key} className="card space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">
                        {e.label} — {KIND_LABEL[e.kind]}
                        {e.color ? ` · ${COLOR_LABEL[e.color].toLowerCase()}` : ""}
                      </h3>
                      <Link href={`/jour/${e.date}/alignement`} className="text-xs text-gold-700 hover:underline">
                        Modifier dans l&apos;alignement du jour
                      </Link>
                    </div>
                    <FormationStatic kind="pp" value={e.map} names={names} markerColor={e.color ? COLOR_FILL[e.color] : undefined} />
                  </div>
                )
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
