"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { toPng } from "html-to-image";
import { createClient } from "@/lib/supabase/client";
import FormationMap, { FormationStatic, type FormationValue } from "@/components/FormationMap";
import { PP_COLORS } from "@/components/PowerPlayLineups";
import { printWithOrientation } from "@/lib/print";
import { lastName } from "@/lib/players";
import {
  BO_START,
  FO_START,
  PHASE_NAME,
  PHASE_SHORT,
  PP_COLOR_LABEL,
  loadUnits,
  newExtraId,
  persistExtra,
  persistPhase,
  seedPhase,
  type PpColor,
  type PpExtra,
  type PpPhase,
  type PpUnit,
} from "@/lib/ppUnits";
import type { Player } from "@/lib/types";

const COLOR_FILL: Record<PpColor, string> = { gris: PP_COLORS.pp1.fill, jaune: PP_COLORS.pp2.fill, bleu: PP_COLORS.pp3.fill };
const KIND = ["pp", "bo", "fo"] as const;
const HINT = ["Zone offensive, but en haut.", "Sortie de zone, glace complète (notre zone en bas).", "Mise au jeu en zone offensive."];
const STARTS: ([number, number][] | null)[] = [null, BO_START, FO_START];
const PHASES: PpPhase[] = [0, 1, 2];

export default function PowerPlayUnitPage({ params }: { params: Promise<{ date: string; label: string }> }) {
  const { date, label: rawLabel } = use(params);
  const label = decodeURIComponent(rawLabel);
  const supabase = createClient();
  const router = useRouter();
  const [unit, setUnit] = useState<PpUnit | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const sheetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ units }, { data: pls }] = await Promise.all([
        loadUnits(supabase),
        supabase.from("players").select("*").eq("active", true).neq("position", "G").order("jersey_number"),
      ]);
      const found = units.find((u) => u.date === date && u.label === label) ?? null;
      if (found) {
        // Les 5 joueurs de l'in-zone sont posés d'office dans le breakout et le faceoff, la première fois.
        let u = found;
        if (!u.breakout) {
          const v = seedPhase(u.inzone, BO_START);
          u = { ...u, breakout: v };
          persistPhase(supabase, u, 1, v);
        }
        if (!u.faceoff) {
          const v = seedPhase(u.inzone, FO_START);
          u = { ...u, faceoff: v };
          persistPhase(supabase, u, 2, v);
        }
        setUnit(u);
      }
      setPlayers((pls ?? []) as Player[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, label]);

  const names = useMemo(
    () => Object.fromEntries(players.filter((p) => p.jersey_number != null).map((p) => [String(p.jersey_number), lastName(p.full_name)])),
    [players]
  );

  function change(phase: PpPhase, value: FormationValue) {
    if (!unit) return;
    const next = { ...unit, ...(phase === 0 ? { inzone: value } : phase === 1 ? { breakout: value } : { faceoff: value }) };
    setUnit(next);
    const k = `main-${phase}`;
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => persistPhase(supabase, next, phase, value), 400);
  }

  function saveExtras(extra: PpExtra[], immediate = false) {
    if (!unit) return;
    const next = { ...unit, extra };
    setUnit(next);
    clearTimeout(timers.current.extra);
    if (immediate) persistExtra(supabase, next, extra);
    else timers.current.extra = setTimeout(() => persistExtra(supabase, next, extra), 400);
  }

  /** Nouvelle glace de la même phase : mêmes 5 joueurs aux positions de départ, jeu à redessiner. */
  function addExtra(phase: PpPhase) {
    if (!unit) return;
    const count = unit.extra.filter((x) => x.phase === phase).length + 2;
    const map: FormationValue = phase === 0 ? { markers: unit.inzone.markers.map((m) => ({ ...m, id: newExtraId() })), note: "" } : seedPhase(unit.inzone, STARTS[phase]!);
    saveExtras([...unit.extra, { id: newExtraId(), phase, title: `${PHASE_SHORT[phase]} ${count}`, map }], true);
  }

  async function remove() {
    if (!unit?.unitId || !window.confirm(`Supprimer l'unité « ${unit.label} » du ${unit.date} ? Tous ses jeux seront perdus.`)) return;
    await supabase.from("pp_units").delete().eq("id", unit.unitId);
    router.push("/power-play");
  }

  async function exportPng() {
    if (!sheetRef.current || !unit) return;
    setExporting(true);
    try {
      const url = await toPng(sheetRef.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const a = document.createElement("a");
      a.download = `power-play-${unit.label}-${unit.date}.png`;
      a.href = url;
      a.click();
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <p className="text-slate-300">Chargement...</p>;
  if (!unit)
    return (
      <div className="space-y-3">
        <p className="text-slate-300">Unité introuvable.</p>
        <Link href="/power-play" className="btn-dark">
          ← Power Play
        </Link>
      </div>
    );

  const fill = unit.color ? COLOR_FILL[unit.color] : undefined;
  const mainOf = (ph: PpPhase) => (ph === 0 ? unit.inzone : ph === 1 ? (unit.breakout ?? { markers: [], note: "" }) : (unit.faceoff ?? { markers: [], note: "" }));
  /** Toutes les glaces d'une phase : le jeu principal, puis les supplémentaires. */
  const mapsOf = (ph: PpPhase) => [
    { id: "main", title: PHASE_NAME[ph] as string, value: mainOf(ph) },
    ...unit.extra.filter((x) => x.phase === ph).map((x) => ({ id: x.id, title: x.title, value: x.map })),
  ];

  return (
    <>
      <div className="space-y-6 print:hidden">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">
              {unit.label}
              {unit.color ? ` — chandail ${PP_COLOR_LABEL[unit.color].toLowerCase()}` : ""}
            </h1>
            <p className="text-slate-400 text-sm capitalize">{format(parseISO(unit.date), "EEEE d MMMM yyyy", { locale: fr })}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {unit.fromLineup && (
              <Link href={`/jour/${unit.date}/alignement`} className="btn-secondary">
                Alignement du jour
              </Link>
            )}
            <button className="btn" onClick={() => printWithOrientation("portrait", "8mm")}>
              Imprimer / PDF
            </button>
            <button className="btn-secondary" onClick={exportPng} disabled={exporting}>
              {exporting ? "Génération..." : "Exporter en image"}
            </button>
            <Link href="/power-play" className="btn-dark">
              ← Power Play
            </Link>
          </div>
        </div>

        {PHASES.map((ph) => (
          <section key={ph} className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-white">{PHASE_NAME[ph]}</h2>
              <button className="btn-secondary text-sm" onClick={() => addExtra(ph)}>
                + Ajouter un {PHASE_NAME[ph]}
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-3 items-start">
              {mapsOf(ph).map((m) => {
                const extra = m.id !== "main" ? unit.extra.find((x) => x.id === m.id) : null;
                return (
                  <div key={m.id} className="space-y-1">
                    <FormationMap
                      kind={KIND[ph]}
                      title={extra ? "" : m.title}
                      subtitle={HINT[ph]}
                      value={m.value}
                      onChange={(v) => (extra ? saveExtras(unit.extra.map((x) => (x.id === extra.id ? { ...x, map: v } : x))) : change(ph, v))}
                      markerColor={fill}
                    />
                    {extra && (
                      <button
                        className="text-xs text-red-400 hover:underline"
                        onClick={() => window.confirm("Supprimer ce jeu ?") && saveExtras(unit.extra.filter((x) => x.id !== extra.id), true)}
                      >
                        Supprimer ce jeu
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {!unit.fromLineup && unit.unitId && (
          <button className="text-xs text-red-400 hover:underline" onClick={remove}>
            Supprimer cette unité
          </button>
        )}
      </div>

      {/* Feuille exportable / imprimable : toutes les glaces, par phase, noms des joueurs sous les ronds.
          Hors écran à l'écran (sert à l'export image), visible seulement à l'impression. */}
      <div ref={sheetRef} className="fixed -left-[9999px] top-0 w-[1100px] bg-white p-6 text-black print:static print:left-0 print:w-auto print:p-0">
        <header className="mb-3 flex items-end justify-between border-b-4 border-black pb-2">
          <div>
            <h1 className="text-[20pt] font-black uppercase leading-none">
              {unit.label}
              {unit.color ? ` — chandail ${PP_COLOR_LABEL[unit.color].toLowerCase()}` : ""}
            </h1>
            <p className="text-[12pt] font-bold capitalize">{format(parseISO(unit.date), "EEEE d MMMM yyyy", { locale: fr })}</p>
          </div>
          <div className="text-right text-[9pt] font-bold">As de Québec M17 AAA — Power Play</div>
        </header>
        <div className="space-y-4">
          {PHASES.map((ph) => (
            <div key={ph} className="grid grid-cols-3 items-start gap-4" style={{ breakInside: "avoid" }}>
              {mapsOf(ph).map((m) => (
                <section key={m.id} style={{ breakInside: "avoid" }}>
                  {m.id === "main" ? (
                    <h2 className="mb-1 border-b-2 border-black pb-0.5 text-[10pt] font-black uppercase tracking-widest">{m.title}</h2>
                  ) : (
                    <div className="mb-1 border-b-2 border-black pb-0.5 text-[10pt]">&nbsp;</div>
                  )}
                  <FormationStatic kind={KIND[ph]} value={m.value} names={names} markerColor={fill} />
                </section>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
