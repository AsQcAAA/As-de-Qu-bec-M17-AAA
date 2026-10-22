"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import FormationMap, { FormationStatic, type FormationValue } from "@/components/FormationMap";
import { PP_COLORS } from "@/components/PowerPlayLineups";
import Modal from "@/components/Modal";
import { lastName } from "@/lib/players";
import type { Player } from "@/lib/types";

type Color = "gris" | "jaune" | "bleu";
type Phase = 0 | 1 | 2; // 0 = en zone, 1 = breakout, 2 = faceoff

const COLOR_FILL: Record<Color, string> = { gris: PP_COLORS.pp1.fill, jaune: PP_COLORS.pp2.fill, bleu: PP_COLORS.pp3.fill };
const COLOR_LABEL: Record<Color, string> = { gris: "Gris", jaune: "Jaune", bleu: "Bleu" };
const LINEUP_KEY: Record<string, { col: "pp1_map" | "pp2_map" | "pp3_map"; color: Color }> = {
  PP1: { col: "pp1_map", color: "gris" },
  PP2: { col: "pp2_map", color: "jaune" },
  PP3: { col: "pp3_map", color: "bleu" },
};
const PHASE_LABELS = ["In-zone", "Breakout", "Faceoff"];
const PHASE_KIND = ["pp", "bo", "fo"] as const;
const PHASE_HINT = [
  "Zone offensive, but en haut.",
  "Sortie de zone, glace complète (notre zone en bas). Les 5 joueurs de l'in-zone sont déjà posés : déplace-les.",
  "Mise au jeu en zone offensive. Les 5 joueurs de l'in-zone sont déjà posés : déplace-les.",
];
// Positions de départ des 5 joueurs pour les autres phases (à déplacer ensuite).
const BO_START: [number, number][] = [[58, 350], [112, 350], [24, 296], [146, 296], [85, 262]];
const FO_START: [number, number][] = [[41, 70], [12, 58], [72, 66], [30, 104], [60, 104]];
const rid = () => Math.random().toString(36).slice(2, 9);
const emptyMap = (): FormationValue => ({ markers: [], note: "" });

interface Unit {
  key: string;
  date: string;
  label: string;
  color: Color | null;
  inzone: FormationValue;
  breakout: FormationValue | null;
  faceoff: FormationValue | null;
  /** « lineup » : l'in-zone vient de l'alignement du jour (modifié là-bas aussi) ; « unit » : créée ici. */
  fromLineup: boolean;
  unitId?: string;
}

/** Les mêmes joueurs que l'in-zone, posés aux positions de départ de la phase. */
function seedPhase(inzone: FormationValue, starts: [number, number][]): FormationValue {
  const numbers = inzone.markers.filter((m) => m.number !== "").map((m) => m.number);
  return { note: "", markers: numbers.slice(0, 5).map((number, i) => ({ id: rid(), number, x: starts[i][0], y: starts[i][1] })) };
}

export default function PowerPlayPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(0);
  const [form, setForm] = useState<{ date: string; label: string; color: Color | "" }>({ date: format(new Date(), "yyyy-MM-dd"), label: "", color: "" });
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function load() {
    const [{ data: us, error: e1 }, { data: lus }, { data: pls }] = await Promise.all([
      supabase.from("pp_units").select("*"),
      supabase.from("lineups").select("lineup_date, pp1_map, pp2_map, pp3_map"),
      supabase.from("players").select("*").eq("active", true).neq("position", "G").order("jersey_number"),
    ]);
    if (e1) setError("L'onglet n'est pas prêt (migration 051 puis 052 à exécuter).");
    const map = new Map<string, Unit>();
    for (const l of lus ?? []) {
      for (const [label, def] of Object.entries(LINEUP_KEY)) {
        const m = (l as Record<string, FormationValue | null>)[def.col];
        const markers = (m?.markers ?? []).filter((x) => x.number !== "");
        if (m && markers.length > 0) {
          const key = `${l.lineup_date}|${label}`;
          map.set(key, { key, date: l.lineup_date as string, label, color: def.color, inzone: { ...m, markers }, breakout: null, faceoff: null, fromLineup: true });
        }
      }
    }
    for (const u of us ?? []) {
      const key = `${u.unit_date}|${u.label}`;
      const prev = map.get(key);
      map.set(key, {
        key,
        date: u.unit_date as string,
        label: u.label as string,
        color: (u.color as Color | null) ?? prev?.color ?? null,
        inzone: prev ? prev.inzone : ((u.map as FormationValue) ?? emptyMap()),
        breakout: (u.bo_map as FormationValue | null) ?? null,
        faceoff: (u.fo_map as FormationValue | null) ?? null,
        fromLineup: !!prev,
        unitId: u.id as string,
      });
    }
    setUnits([...map.values()]);
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

  const byDate = useMemo(() => {
    const m = new Map<string, Unit[]>();
    for (const u of units) m.set(u.date, [...(m.get(u.date) ?? []), u]);
    for (const list of m.values()) list.sort((a, b) => a.label.localeCompare(b.label));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [units]);

  const open = units.find((u) => u.key === openKey) ?? null;

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const label = form.label.trim() || "Unité";
    const { error: err } = await supabase.from("pp_units").upsert(
      { unit_date: form.date, label, color: form.color || null, kind: "inzone", map: emptyMap() },
      { onConflict: "unit_date,label", ignoreDuplicates: true }
    );
    if (err) {
      setError(err.message);
      return;
    }
    setForm({ ...form, label: "" });
    setShowForm(false);
    await load();
  }

  /** Écrit une phase : l'in-zone d'une unité d'alignement retourne dans l'alignement, le reste dans pp_units. */
  function persist(u: Unit, ph: Phase, value: FormationValue) {
    const k = `${u.key}-${ph}`;
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(async () => {
      if (ph === 0 && u.fromLineup) {
        await supabase.from("lineups").update({ [LINEUP_KEY[u.label].col]: value }).eq("lineup_date", u.date);
        return;
      }
      const col = ph === 0 ? "map" : ph === 1 ? "bo_map" : "fo_map";
      await supabase
        .from("pp_units")
        .upsert({ unit_date: u.date, label: u.label, color: u.color, kind: "inzone", [col]: value }, { onConflict: "unit_date,label" });
    }, 400);
  }

  function setPhaseValue(u: Unit, ph: Phase, value: FormationValue) {
    setUnits((prev) =>
      prev.map((x) => (x.key === u.key ? { ...x, ...(ph === 0 ? { inzone: value } : ph === 1 ? { breakout: value } : { faceoff: value }) } : x))
    );
    persist(u, ph, value);
  }

  /** Ouvre une phase ; la première fois, les 5 joueurs de l'in-zone y sont posés d'office. */
  function goPhase(u: Unit, ph: Phase) {
    setPhase(ph);
    if (ph === 1 && !u.breakout) setPhaseValue(u, 1, seedPhase(u.inzone, BO_START));
    if (ph === 2 && !u.faceoff) setPhaseValue(u, 2, seedPhase(u.inzone, FO_START));
  }

  async function removeUnit(u: Unit) {
    if (!u.unitId || !window.confirm(`Supprimer l'unité « ${u.label} » du ${u.date} ? Ses phases breakout et faceoff seront perdues.`)) return;
    await supabase.from("pp_units").delete().eq("id", u.unitId);
    setOpenKey(null);
    await load();
  }

  const valueOf = (u: Unit): FormationValue => (phase === 0 ? u.inzone : phase === 1 ? (u.breakout ?? emptyMap()) : (u.faceoff ?? emptyMap()));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Power Play</h1>
          <p className="text-slate-400 text-sm">
            Tes unités par date. Clique une unité pour dessiner son in-zone, son breakout et son faceoff. Les unités saisies dans
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
            <select className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value as Color | "" })}>
              <option value="">—</option>
              {(Object.keys(COLOR_LABEL) as Color[]).map((c) => (
                <option key={c} value={c}>
                  {COLOR_LABEL[c]}
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
            <h2 className="text-lg font-bold capitalize text-white">{format(parseISO(date), "EEEE d MMMM yyyy", { locale: fr })}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((u) => (
                <button
                  key={u.key}
                  onClick={() => {
                    setOpenKey(u.key);
                    setPhase(0);
                  }}
                  className="card space-y-2 text-left transition hover:ring-2 hover:ring-gold-400"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">
                      {u.label}
                      {u.color ? ` · ${COLOR_LABEL[u.color].toLowerCase()}` : ""}
                    </h3>
                    <span className="flex gap-1 text-[10px] font-black uppercase">
                      <span className="rounded bg-gold-100 px-1.5 py-0.5 text-gold-800">In-zone</span>
                      <span className={`rounded px-1.5 py-0.5 ${u.breakout ? "bg-gold-100 text-gold-800" : "bg-slate-100 text-slate-400"}`}>BO</span>
                      <span className={`rounded px-1.5 py-0.5 ${u.faceoff ? "bg-gold-100 text-gold-800" : "bg-slate-100 text-slate-400"}`}>FO</span>
                    </span>
                  </div>
                  <FormationStatic kind="pp" value={{ ...u.inzone, note: "" }} names={names} markerColor={u.color ? COLOR_FILL[u.color] : undefined} />
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {open && (
        <Modal onClose={() => setOpenKey(null)}>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-bold capitalize text-white">
                {open.label} — {format(parseISO(open.date), "EEEE d MMMM yyyy", { locale: fr })}
                {open.color ? ` · ${COLOR_LABEL[open.color].toLowerCase()}` : ""}
              </h2>
              <div className="flex gap-2">
                {open.fromLineup && (
                  <Link href={`/jour/${open.date}/alignement`} className="btn-secondary text-sm">
                    Alignement du jour
                  </Link>
                )}
                <button className="btn-dark" onClick={() => setOpenKey(null)}>
                  Fermer
                </button>
              </div>
            </div>
            <div className="max-w-xl">
              <FormationMap
                key={`${open.key}-${phase}`}
                kind={PHASE_KIND[phase]}
                title={`${open.label} — ${PHASE_LABELS[phase]}`}
                subtitle={PHASE_HINT[phase]}
                value={valueOf(open)}
                onChange={(v) => setPhaseValue(open, phase, v)}
                roster={roster}
                markerColor={open.color ? COLOR_FILL[open.color] : undefined}
                waveLabels={PHASE_LABELS}
                wave={phase}
                onWave={(i) => goPhase(open, i as Phase)}
              />
            </div>
            {!open.fromLineup && open.unitId && (
              <button className="text-xs text-red-400 hover:underline" onClick={() => removeUnit(open)}>
                Supprimer cette unité
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
