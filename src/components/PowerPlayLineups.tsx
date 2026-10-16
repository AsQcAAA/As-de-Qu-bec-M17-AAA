"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import FormationMap, { type FormationValue } from "@/components/FormationMap";
import type { Lineup } from "@/lib/types";

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
  const [pp1, setPp1] = useState<FormationValue>(() => lineup?.pp1_map ?? { markers: [], note: "" });
  const [pp2, setPp2] = useState<FormationValue>(() => lineup?.pp2_map ?? { markers: [], note: "" });
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function save(key: "pp1_map" | "pp2_map", value: FormationValue) {
    (key === "pp1_map" ? setPp1 : setPp2)(value);
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      const l = lineup ?? (await ensureLineup());
      if (!l) return;
      await supabase.from("lineups").update({ [key]: value }).eq("id", l.id);
    }, 500);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card">
        <FormationMap
          kind="pp"
          title="Power Play 1"
          subtitle="Première unité — zone offensive, but en haut. Clique un joueur pour le poser, puis glisse-le."
          value={pp1}
          onChange={(v) => save("pp1_map", v)}
          roster={roster}
        />
      </div>
      <div className="card">
        <FormationMap
          kind="pp"
          title="Power Play 2"
          subtitle="Deuxième unité — zone offensive, but en haut."
          value={pp2}
          onChange={(v) => save("pp2_map", v)}
          roster={roster}
        />
      </div>
    </div>
  );
}
