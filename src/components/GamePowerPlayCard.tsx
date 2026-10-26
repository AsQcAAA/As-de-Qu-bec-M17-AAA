"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { FormationStatic } from "@/components/FormationMap";
import { PP_COLORS } from "@/components/PowerPlayLineups";
import { PP_COLOR_LABEL, loadUnits, unitHref, type PpColor, type PpUnit } from "@/lib/ppUnits";
import type { Game } from "@/lib/types";

const FILL: Record<PpColor, string> = { gris: PP_COLORS.pp1.fill, jaune: PP_COLORS.pp2.fill, bleu: PP_COLORS.pp3.fill };

/**
 * Power Play utilisé lors d'un match : on lie des unités de l'onglet Power Play au match (par exemple le PP
 * travaillé à l'entraînement de jeudi et repris au match), pour pouvoir y revenir match par match.
 */
export default function GamePowerPlayCard({ game, onChanged }: { game: Game; onChanged?: () => void }) {
  const supabase = createClient();
  const [units, setUnits] = useState<PpUnit[]>([]);
  const [links, setLinks] = useState<{ date: string; label: string }[]>(game.pp_units ?? []);
  const [pick, setPick] = useState("");

  useEffect(() => {
    loadUnits(supabase).then(({ units: u }) => setUnits(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setLinks(game.pp_units ?? []), [game.pp_units]);

  const sorted = useMemo(() => units.slice().sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label)), [units]);
  const linked = links.map((l) => ({ link: l, unit: units.find((u) => u.date === l.date && u.label === l.label) ?? null }));
  const available = sorted.filter((u) => !links.some((l) => l.date === u.date && l.label === u.label));

  async function save(next: { date: string; label: string }[]) {
    setLinks(next);
    await supabase.from("games").update({ pp_units: next }).eq("id", game.id);
    onChanged?.();
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold">Power Play utilisé</h2>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto text-sm"
            value={pick}
            onChange={(e) => {
              const [date, label] = e.target.value.split("|");
              setPick("");
              if (date && label) save([...links, { date, label }]);
            }}
          >
            <option value="">Lier un power play…</option>
            {available.map((u) => (
              <option key={u.key} value={`${u.date}|${u.label}`}>
                {u.label} — {format(parseISO(u.date), "EEE d MMM yyyy", { locale: fr })}
                {u.color ? ` (${PP_COLOR_LABEL[u.color].toLowerCase()})` : ""}
              </option>
            ))}
          </select>
          <Link href="/power-play" className="text-sm text-gold-700 hover:underline">
            Onglet Power Play
          </Link>
        </div>
      </div>
      {linked.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun power play lié à ce match. Choisis, dans la liste, celui que tu as utilisé (travaillé à la pratique ou repris tel quel).</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {linked.map(({ link, unit }) => (
            <div key={`${link.date}|${link.label}`} className="rounded-xl border border-slate-200 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold">
                  {link.label}
                  <span className="font-normal text-slate-500 capitalize"> — {format(parseISO(link.date), "EEE d MMM", { locale: fr })}</span>
                </div>
                <div className="flex gap-2 text-xs">
                  {unit && (
                    <Link href={unitHref(unit)} className="text-gold-700 hover:underline">
                      Ouvrir
                    </Link>
                  )}
                  <button className="text-red-600 hover:underline" onClick={() => save(links.filter((l) => !(l.date === link.date && l.label === link.label)))}>
                    Retirer
                  </button>
                </div>
              </div>
              {unit ? (
                <FormationStatic kind="pp" value={{ ...unit.inzone, note: "" }} markerColor={unit.color ? FILL[unit.color] : undefined} />
              ) : (
                <p className="text-xs text-slate-400">Cette unité n&apos;existe plus.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
