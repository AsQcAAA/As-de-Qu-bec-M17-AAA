import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormationValue } from "@/components/FormationMap";

export type PpColor = "gris" | "jaune" | "bleu";
export type PpPhase = 0 | 1 | 2; // 0 = en zone, 1 = breakout, 2 = faceoff

export const PP_COLOR_LABEL: Record<PpColor, string> = { gris: "Gris", jaune: "Jaune", bleu: "Bleu" };
export const LINEUP_KEY: Record<string, { col: "pp1_map" | "pp2_map" | "pp3_map"; color: PpColor }> = {
  PP1: { col: "pp1_map", color: "gris" },
  PP2: { col: "pp2_map", color: "jaune" },
  PP3: { col: "pp3_map", color: "bleu" },
};
// Positions de départ des 5 joueurs pour le breakout et le faceoff (à déplacer ensuite).
export const BO_START: [number, number][] = [[58, 350], [112, 350], [24, 296], [146, 296], [85, 262]];
export const FO_START: [number, number][] = [[41, 70], [12, 58], [72, 66], [30, 104], [60, 104]];

const rid = () => Math.random().toString(36).slice(2, 9);
export const emptyMap = (): FormationValue => ({ markers: [], note: "" });

/** Glace supplémentaire d'une phase : même phase, jeu différent. */
export interface PpExtra {
  id: string;
  phase: PpPhase;
  title: string;
  map: FormationValue;
}

export interface PpUnit {
  key: string;
  date: string;
  label: string;
  color: PpColor | null;
  inzone: FormationValue;
  breakout: FormationValue | null;
  faceoff: FormationValue | null;
  extra: PpExtra[];
  /** « true » : l'in-zone vient de l'alignement du jour (modifié là-bas aussi). */
  fromLineup: boolean;
  unitId?: string;
}

/** Les mêmes joueurs que l'in-zone, posés aux positions de départ de la phase. */
export function seedPhase(inzone: FormationValue, starts: [number, number][]): FormationValue {
  const numbers = inzone.markers.filter((m) => m.number !== "").map((m) => m.number);
  return { note: "", markers: numbers.slice(0, 5).map((number, i) => ({ id: rid(), number, x: starts[i][0], y: starts[i][1] })) };
}

/** Toutes les unités : celles de l'alignement du jour (PP1 à PP3) et celles créées dans l'onglet. */
export async function loadUnits(supabase: SupabaseClient): Promise<{ units: PpUnit[]; error: boolean }> {
  const [{ data: us, error }, { data: lus }] = await Promise.all([
    supabase.from("pp_units").select("*"),
    supabase.from("lineups").select("lineup_date, pp1_map, pp2_map, pp3_map"),
  ]);
  const map = new Map<string, PpUnit>();
  for (const l of lus ?? []) {
    for (const [label, def] of Object.entries(LINEUP_KEY)) {
      const m = (l as Record<string, FormationValue | null>)[def.col];
      const markers = (m?.markers ?? []).filter((x) => x.number !== "");
      if (m && markers.length > 0) {
        const key = `${l.lineup_date}|${label}`;
        map.set(key, { key, date: l.lineup_date as string, label, color: def.color, inzone: { ...m, markers }, breakout: null, faceoff: null, extra: [], fromLineup: true });
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
      color: (u.color as PpColor | null) ?? prev?.color ?? null,
      inzone: prev ? prev.inzone : ((u.map as FormationValue) ?? emptyMap()),
      breakout: (u.bo_map as FormationValue | null) ?? null,
      faceoff: (u.fo_map as FormationValue | null) ?? null,
      extra: ((u.extra as PpExtra[] | null) ?? []).filter((x) => x && x.id),
      fromLineup: !!prev,
      unitId: u.id as string,
    });
  }
  return { units: [...map.values()], error: !!error };
}

/** Écrit une phase : l'in-zone d'une unité d'alignement retourne dans l'alignement, le reste dans pp_units. */
export async function persistPhase(supabase: SupabaseClient, u: PpUnit, phase: PpPhase, value: FormationValue) {
  if (phase === 0 && u.fromLineup) {
    await supabase.from("lineups").update({ [LINEUP_KEY[u.label].col]: value }).eq("lineup_date", u.date);
    return;
  }
  const col = phase === 0 ? "map" : phase === 1 ? "bo_map" : "fo_map";
  await supabase.from("pp_units").upsert({ unit_date: u.date, label: u.label, color: u.color, kind: "inzone", [col]: value }, { onConflict: "unit_date,label" });
}

export const unitHref = (u: { date: string; label: string }) => `/power-play/${u.date}/${encodeURIComponent(u.label)}`;

/** Enregistre la liste des glaces supplémentaires d'une unité. */
export async function persistExtra(supabase: SupabaseClient, u: PpUnit, extra: PpExtra[]) {
  await supabase.from("pp_units").upsert({ unit_date: u.date, label: u.label, color: u.color, kind: "inzone", extra }, { onConflict: "unit_date,label" });
}

export const newExtraId = rid;
export const PHASE_NAME = ["In-zone", "Breakout", "Faceoff"] as const;
export const PHASE_SHORT = ["IZ", "BO", "FO"] as const;
