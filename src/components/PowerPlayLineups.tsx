"use client";

import { useEffect, useRef, useState } from "react";
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
  const pending = useRef<Record<string, () => Promise<void>>>({});
  const queue = useRef<Promise<void>>(Promise.resolve());
  const current = useRef({ pp1_map: pp1, pp2_map: pp2, pp3_map: pp3 });
  const [saveError, setSaveError] = useState(false);

  /** Un envoi à la fois, dans l'ordre : un ancien état n'écrase jamais le plus récent. */
  function enqueue(run: () => Promise<void>) {
    const p = queue.current.then(run, run);
    queue.current = p.then(() => setSaveError(false), () => setSaveError(true));
  }

  function flushAll() {
    for (const k of Object.keys(pending.current)) {
      clearTimeout(timers.current[k]);
      const run = pending.current[k];
      delete pending.current[k];
      enqueue(run);
    }
  }

  useEffect(() => {
    const onHide = () => flushAll();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flushAll(); // en quittant la page, le dernier changement part quand même
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Geste sur la glace : enregistré tout de suite. Note : à la fin de la frappe. */
  function save(key: "pp1_map" | "pp2_map" | "pp3_map", value: FormationValue) {
    const prev = current.current[key];
    current.current = { ...current.current, [key]: value };
    ({ pp1_map: setPp1, pp2_map: setPp2, pp3_map: setPp3 })[key](value);
    const run = async () => {
      const l = lineup ?? (await ensureLineup());
      if (!l) return;
      const { error } = await supabase.from("lineups").update({ [key]: value }).eq("id", l.id);
      if (error) throw error;
    };
    clearTimeout(timers.current[key]);
    const noteOnly =
      prev.note !== value.note &&
      JSON.stringify(prev.markers) === JSON.stringify(value.markers) &&
      JSON.stringify(prev.arrows ?? []) === JSON.stringify(value.arrows ?? []);
    if (!noteOnly) {
      delete pending.current[key];
      enqueue(run);
      return;
    }
    pending.current[key] = run;
    timers.current[key] = setTimeout(() => {
      delete pending.current[key];
      enqueue(run);
    }, 500);
  }

  async function toggleTv(on: boolean) {
    setShowTv(on);
    const l = lineup ?? (await ensureLineup());
    if (l) await supabase.from("lineups").update({ show_pp_tv: on }).eq("id", l.id);
  }

  return (
    <div className="space-y-4">
    {saveError && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">Un changement de power play n&apos;a pas pu être enregistré. Vérifie ta connexion puis modifie à nouveau le jeu.</div>}
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
