"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { toPng } from "html-to-image";
import FormationMap, { FormationStatic, type FormationValue } from "@/components/FormationMap";
import { printWithOrientation } from "@/lib/print";
import { PP_COLORS } from "@/components/PowerPlayLineups";
import { lastName } from "@/lib/players";
import { BO_START, FO_START, PP_COLOR_LABEL, loadUnits, persistPhase, seedPhase, type PpColor, type PpPhase, type PpUnit } from "@/lib/ppUnits";
import type { Player } from "@/lib/types";

const COLOR_FILL: Record<PpColor, string> = { gris: PP_COLORS.pp1.fill, jaune: PP_COLORS.pp2.fill, bleu: PP_COLORS.pp3.fill };

export default function PowerPlayUnitPage({ params }: { params: Promise<{ date: string; label: string }> }) {
  const { date, label: rawLabel } = use(params);
  const label = decodeURIComponent(rawLabel);
  const supabase = createClient();
  const router = useRouter();
  const [unit, setUnit] = useState<PpUnit | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
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

  const roster = useMemo(
    () => players.filter((p) => p.jersey_number != null).map((p) => ({ number: String(p.jersey_number), name: lastName(p.full_name) })),
    [players]
  );

  function change(phase: PpPhase, value: FormationValue) {
    if (!unit) return;
    const next = { ...unit, ...(phase === 0 ? { inzone: value } : phase === 1 ? { breakout: value } : { faceoff: value }) };
    setUnit(next);
    clearTimeout(timers.current[phase]);
    timers.current[phase] = setTimeout(() => persistPhase(supabase, next, phase, value), 400);
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

  async function remove() {
    if (!unit?.unitId || !window.confirm(`Supprimer l'unité « ${unit.label} » du ${unit.date} ? Ses trois phases seront perdues.`)) return;
    await supabase.from("pp_units").delete().eq("id", unit.unitId);
    router.push("/power-play");
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
  const names = Object.fromEntries(roster.map((r) => [r.number, r.name]));
  return (
    <>
    <div className="space-y-5 print:hidden">
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

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1.2fr] items-start">
        <FormationMap
          kind="pp"
          title="In-zone"
          subtitle="Zone offensive, but en haut."
          value={unit.inzone}
          onChange={(v) => change(0, v)}
          markerColor={fill}
        />
        <FormationMap
          kind="bo"
          title="Breakout"
          subtitle="Sortie de zone, glace complète (notre zone en bas)."
          value={unit.breakout ?? { markers: [], note: "" }}
          onChange={(v) => change(1, v)}
          markerColor={fill}
        />
        <FormationMap
          kind="fo"
          title="Faceoff"
          subtitle="Mise au jeu en zone offensive."
          value={unit.faceoff ?? { markers: [], note: "" }}
          onChange={(v) => change(2, v)}
          markerColor={fill}
        />
      </div>

      {!unit.fromLineup && unit.unitId && (
        <button className="text-xs text-red-400 hover:underline" onClick={remove}>
          Supprimer cette unité
        </button>
      )}
    </div>

    {/* Feuille exportable / imprimable : les trois phases côte à côte, noms des joueurs sous les ronds.
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
      <div className="grid grid-cols-3 items-start gap-4">
        {([["In-zone", "pp", unit.inzone], ["Breakout", "bo", unit.breakout], ["Faceoff", "fo", unit.faceoff]] as const).map(([title, kind, v]) => (
          <section key={title} style={{ breakInside: "avoid" }}>
            <h2 className="mb-1 border-b-2 border-black pb-0.5 text-[10pt] font-black uppercase tracking-widest">{title}</h2>
            <FormationStatic kind={kind} value={v ?? { markers: [], note: "" }} names={names} markerColor={fill} />
          </section>
        ))}
      </div>
    </div>
    </>
  );
}
