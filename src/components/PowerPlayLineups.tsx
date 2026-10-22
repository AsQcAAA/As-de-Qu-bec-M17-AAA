"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import FormationMap, { type FormationValue } from "@/components/FormationMap";
import type { Lineup } from "@/lib/types";

/** Glace vide au départ : les « X » vides des anciennes versions sont retirés, seuls les joueurs posés restent. */
/** Chandails de pratique : une unité = une couleur, donc les joueurs ensemble ont le même chandail. */
export const PP_COLORS = { pp1: { label: "Gris", fill: "#94a3b8" }, pp2: { label: "Jaune", fill: "#fdca37" }, pp3: { label: "Bleu", fill: "#3b82f6" } } as const;

const clean = (v?: FormationValue | null): FormationValue => ({
  ...(v ?? { note: "" }),
  note: v?.note ?? "",
  markers: (v?.markers ?? []).filter((m) => m.number !== ""),
});

/**
 * Nos deux unités de avantage numérique, posées sur une demi-glace : on place nos
 * joueurs (par leur numéro) là où ils jouent. Enregistré avec l'alignement du jour.
 */
export default function PowerPlayLineups({
  lineup,
  ensureLineup,
  roster,
}: {
  lineup: Lineup | null;
  ensureLineup: () => Promise<Lineup | null>;
  roster: { number: string; name: string }[];
}) {
  const supabase = createClient();
  const [pp1, setPp1] = useState<FormationValue>(() => clean(lineup?.pp1_map));
  const [pp2, setPp2] = useState<FormationValue>(() => clean(lineup?.pp2_map));
  const [pp3, setPp3] = useState<FormationValue>(() => clean(lineup?.pp3_map));
  /** 3e unité (bleu) : optionnelle, affichée sur demande ou dès qu'elle contient des joueurs. */
  const [showPp3, setShowPp3] = useState<boolean>(() => clean(lineup?.pp3_map).markers.length > 0);
  const [showTv, setShowTv] = useState<boolean>(lineup?.show_pp_tv ?? false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function save(key: "pp1_map" | "pp2_map" | "pp3_map", value: FormationValue) {
    ({ pp1_map: setPp1, pp2_map: setPp2, pp3_map: setPp3 })[key](value);
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      const l = lineup ?? (await ensureLineup());
      if (!l) return;
      await supabase.from("lineups").update({ [key]: value }).eq("id", l.id);
    }, 500);
  }

  async function toggleTv(on: boolean) {
    setShowTv(on);
    const l = lineup ?? (await ensureLineup());
    if (l) await supabase.from("lineups").update({ show_pp_tv: on }).eq("id", l.id);
  }

  return (
    <div className="space-y-4">
    <label className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white">
      <input type="checkbox" checked={showTv} onChange={(e) => toggleTv(e.target.checked)} />
      Afficher les power plays sur la TV de cette journée
    </label>
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card">
        <FormationMap
          kind="pp"
          title={`Power Play 1 — chandail ${PP_COLORS.pp1.label.toLowerCase()}`}
          markerColor={PP_COLORS.pp1.fill}
          subtitle="Première unité — zone offensive, but en haut. Clique un joueur pour le poser, puis glisse-le."
          value={pp1}
          onChange={(v) => save("pp1_map", v)}
          roster={roster}
        />
      </div>
      <div className="card">
        <FormationMap
          kind="pp"
          title={`Power Play 2 — chandail ${PP_COLORS.pp2.label.toLowerCase()}`}
          markerColor={PP_COLORS.pp2.fill}
          subtitle="Deuxième unité — zone offensive, but en haut."
          value={pp2}
          onChange={(v) => save("pp2_map", v)}
          roster={roster}
        />
      </div>
      {showPp3 && (
        <div className="card">
          <FormationMap
            kind="pp"
            title={`Power Play 3 — chandail ${PP_COLORS.pp3.label.toLowerCase()}`}
            markerColor={PP_COLORS.pp3.fill}
            subtitle="Troisième unité — zone offensive, but en haut."
            value={pp3}
            onChange={(v) => save("pp3_map", v)}
            roster={roster}
          />
          <button
            className="mt-2 text-xs text-red-600 hover:underline"
            onClick={() => {
              save("pp3_map", { markers: [], note: "" });
              setShowPp3(false);
            }}
          >
            Retirer le PP3
          </button>
        </div>
      )}
    </div>
    {!showPp3 && (
      <button className="btn-secondary" onClick={() => setShowPp3(true)}>
        + Ajouter un 3e PP (bleu)
      </button>
    )}
    </div>
  );
}
