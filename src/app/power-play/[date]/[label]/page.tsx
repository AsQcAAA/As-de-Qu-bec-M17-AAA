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
import type { Game, Player } from "@/lib/types";

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
  /** Toutes les unités, pour copier un jeu d'une autre. */
  const [allUnits, setAllUnits] = useState<PpUnit[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const sheetRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  /** Matchs où cette unité a été utilisée, et tous les matchs (pour en lier un). */
  const [allGames, setAllGames] = useState<Game[]>([]);

  useEffect(() => {
    (async () => {
      const [{ units }, { data: pls }] = await Promise.all([
        loadUnits(supabase),
        supabase.from("players").select("*").eq("active", true).neq("position", "G").order("jersey_number"),
      ]);
      setAllUnits(units);
      const found = units.find((u) => u.date === date && u.label === label) ?? null;
      if (found) {
        // Les 5 joueurs de l'in-zone sont posés d'office dans le breakout et le faceoff, la première fois.
        let u = found;
        if (!u.breakout) {
          const v = seedPhase(u.inzone, BO_START);
          u = { ...u, breakout: v };
          persistPhase(supabase, u, 1, v).catch(() => setSaveError(true));
        }
        if (!u.faceoff) {
          const v = seedPhase(u.inzone, FO_START);
          u = { ...u, faceoff: v };
          persistPhase(supabase, u, 2, v).catch(() => setSaveError(true));
        }
        setUnit(u);
      }
      setPlayers((pls ?? []) as Player[]);
      const { data: gms } = await supabase.from("games").select("*").order("game_date", { ascending: false });
      setAllGames((gms ?? []) as Game[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, label]);

  const names = useMemo(
    () => Object.fromEntries(players.filter((p) => p.jersey_number != null).map((p) => [String(p.jersey_number), lastName(p.full_name)])),
    [players]
  );

  /** Dernier état connu (évite qu'un second changement dans le même tick parte d'un état périmé). */
  const unitRef = useRef<PpUnit | null>(null);
  unitRef.current = unit;
  /** Enregistrements en attente (anti-rebond), vidés au départ de la page pour ne jamais perdre un changement. */
  const pending = useRef<Record<string, () => Promise<unknown>>>({});
  const [saveError, setSaveError] = useState(false);

  function schedule(k: string, run: () => Promise<unknown>, delay = 400) {
    clearTimeout(timers.current[k]);
    pending.current[k] = run;
    timers.current[k] = setTimeout(() => {
      delete pending.current[k];
      run().catch(() => setSaveError(true));
    }, delay);
  }

  function flushAll() {
    for (const k of Object.keys(pending.current)) {
      clearTimeout(timers.current[k]);
      const run = pending.current[k];
      delete pending.current[k];
      run().catch(() => undefined);
    }
  }

  useEffect(() => {
    const onHide = () => flushAll();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flushAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(phase: PpPhase, value: FormationValue) {
    const cur = unitRef.current;
    if (!cur) return;
    const next = { ...cur, ...(phase === 0 ? { inzone: value } : phase === 1 ? { breakout: value } : { faceoff: value }) };
    unitRef.current = next;
    setUnit(next);
    schedule(`main-${phase}`, () => persistPhase(supabase, next, phase, value));
  }

  function saveExtras(extra: PpExtra[], immediate = false) {
    const cur = unitRef.current;
    if (!cur) return;
    const next = { ...cur, extra };
    unitRef.current = next;
    setUnit(next);
    if (immediate) {
      clearTimeout(timers.current.extra);
      delete pending.current.extra;
      persistExtra(supabase, next, extra).catch(() => setSaveError(true));
    } else schedule("extra", () => persistExtra(supabase, next, extra));
  }

  /** Nouvelle glace de la même phase : mêmes 5 joueurs aux positions de départ, jeu à redessiner. */
  function addExtra(phase: PpPhase) {
    if (!unit) return;
    const count = unit.extra.filter((x) => x.phase === phase).length + 2;
    const map: FormationValue = phase === 0 ? { markers: unit.inzone.markers.map((m) => ({ ...m, id: newExtraId() })), note: "" } : seedPhase(unit.inzone, STARTS[phase]!);
    saveExtras([...unit.extra, { id: newExtraId(), phase, title: `${PHASE_SHORT[phase]} ${count}`, map }], true);
  }

  /** Jeux d'une phase dans les autres unités (du plus récent au plus ancien) : source possible d'une copie. */
  function copySources(phase: PpPhase) {
    const out: { id: string; text: string; map: FormationValue }[] = [];
    const sorted = allUnits.filter((u) => !(unit && u.key === unit.key)).sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
    for (const u of sorted) {
      const main = phase === 0 ? u.inzone : phase === 1 ? u.breakout : u.faceoff;
      const head = `${u.label} — ${format(parseISO(u.date), "d MMM yyyy", { locale: fr })}`;
      const has = (m: FormationValue | null) => !!m && (m.markers.length > 0 || (m.arrows?.length ?? 0) > 0);
      if (main && has(main)) out.push({ id: `${u.key}-main`, text: head, map: main });
      u.extra
        .filter((x) => x.phase === phase && has(x.map))
        .forEach((x, i) => out.push({ id: `${u.key}-${x.id}`, text: `${head} (jeu ${i + 2})`, map: x.map }));
    }
    return out;
  }

  /** Copie un jeu d'une autre unité comme nouvelle glace de cette phase (copie indépendante). */
  function copyFrom(phase: PpPhase, sourceId: string) {
    if (!unit) return;
    const src = copySources(phase).find((x) => x.id === sourceId);
    if (!src) return;
    const map: FormationValue = {
      ...src.map,
      markers: src.map.markers.map((m) => ({ ...m, id: newExtraId() })),
      arrows: src.map.arrows?.map((a) => ({ ...a, id: newExtraId() })),
    };
    saveExtras([...unit.extra, { id: newExtraId(), phase, title: "", map }], true);
  }

  /** Supprime le jeu 1 d'une phase : le jeu 2 devient le jeu 1, la phase n'est jamais laissée vide. */
  function removeMain(phase: PpPhase) {
    if (!unit) return;
    const first = unit.extra.find((x) => x.phase === phase);
    if (!first) return;
    const warn = phase === 0 && unit.fromLineup ? " L'in-zone de l'alignement du jour sera aussi remplacé." : "";
    if (!window.confirm(`Supprimer le jeu 1 ? Le jeu 2 prendra sa place.${warn}`)) return;
    const rest = unit.extra.filter((x) => x.id !== first.id);
    const next = { ...unit, extra: rest, ...(phase === 0 ? { inzone: first.map } : phase === 1 ? { breakout: first.map } : { faceoff: first.map }) };
    setUnit(next);
    persistPhase(supabase, next, phase, first.map).catch(() => setSaveError(true));
    persistExtra(supabase, next, rest).catch(() => setSaveError(true));
  }

  const usedIn = allGames.filter((g) => (g.pp_units ?? []).some((l) => l.date === date && l.label === label));
  async function linkGame(gameId: string) {
    const g = allGames.find((x) => x.id === gameId);
    if (!g) return;
    const next = [...(g.pp_units ?? []), { date, label }];
    await supabase.from("games").update({ pp_units: next }).eq("id", gameId);
    setAllGames((prev) => prev.map((x) => (x.id === gameId ? { ...x, pp_units: next } : x)));
  }
  async function unlinkGame(gameId: string) {
    const g = allGames.find((x) => x.id === gameId);
    if (!g) return;
    const next = (g.pp_units ?? []).filter((l) => !(l.date === date && l.label === label));
    await supabase.from("games").update({ pp_units: next }).eq("id", gameId);
    setAllGames((prev) => prev.map((x) => (x.id === gameId ? { ...x, pp_units: next } : x)));
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

  // Feuille en PAYSAGE (281 × 170 mm utiles) : trois colonnes In-zone | Breakout | Faceoff. Le breakout (glace
  // complète, haute et étroite) est plus étroit que les deux demi-glaces ; toutes les largeurs sont calculées
  // pour que la plus haute colonne tienne dans la page, même avec plusieurs jeux par phase.
  const colWidths = (() => {
    const PAGE_W = 281 - 2 * 8; // largeur utile moins les deux gouttières
    const AVAIL_H = 170;
    const weights = [1.05, 1, 1.3];
    // Largeur maximale de chaque colonne d'après SA hauteur (une colonne à un seul dessin peut être très large).
    const caps = PHASES.map((ph) => {
      const maps = mapsOf(ph);
      const ratio = maps.length * (ph === 1 ? 400 / 170 : 178 / 170);
      const overhead = maps.reduce((n, m) => n + 9 + (m.value.note.trim() ? 8 : 0), 0);
      return Math.max(14, (AVAIL_H - overhead) / ratio);
    });
    const total = (u: number) => caps.reduce((n, c, i) => n + Math.min(c, u * weights[i]), 0);
    // Les colonnes plafonnées gardent leur maximum ; la largeur restante revient à celles qui peuvent grandir.
    if (total(1000) <= PAGE_W) return caps;
    let lo = 1;
    let hi = 1000;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (total(mid) > PAGE_W) hi = mid;
      else lo = mid;
    }
    return caps.map((c, i) => Math.min(c, lo * weights[i]));
  })();

  return (
    <>
      <div className="space-y-6 print:hidden">
        {saveError && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">Un changement n&apos;a pas pu être enregistré. Vérifie ta connexion puis modifie à nouveau le jeu.</div>}
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
            <button className="btn" onClick={() => printWithOrientation("landscape", "8mm")}>
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

        {/* Matchs où ce power play a été utilisé : on peut y revenir, et en lier un nouveau. */}
        <section className="card space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold">Utilisé lors des matchs ({usedIn.length})</h2>
            <select className="input w-auto text-sm" value="" onChange={(e) => e.target.value && linkGame(e.target.value)}>
              <option value="">Lier à un match…</option>
              {allGames
                .filter((g) => !usedIn.some((u) => u.id === g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {format(parseISO(g.game_date), "d MMM yyyy", { locale: fr })} — {g.opponent}
                  </option>
                ))}
            </select>
          </div>
          {usedIn.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun match lié. Lie cette unité au match où tu l&apos;as utilisée pour pouvoir y revenir.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {usedIn.map((g) => (
                <span key={g.id} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 text-sm">
                  <Link href={`/resultats/${g.id}`} className="font-semibold hover:text-gold-700 hover:underline">
                    {format(parseISO(g.game_date), "d MMM yyyy", { locale: fr })} — {g.opponent}
                    {g.result ? ` (${g.goals_for ?? "-"}–${g.goals_against ?? "-"})` : ""}
                  </Link>
                  <button className="text-xs text-red-600 hover:underline" onClick={() => unlinkGame(g.id)}>
                    Retirer
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {PHASES.map((ph) => (
          <section key={ph} className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-white">{PHASE_NAME[ph]}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {copySources(ph).length > 0 && (
                  <select
                    className="input w-auto text-sm"
                    value=""
                    onChange={(e) => e.target.value && copyFrom(ph, e.target.value)}
                    aria-label={`Copier un ${PHASE_NAME[ph]} d'une autre unité`}
                  >
                    <option value="">Copier d&apos;une autre unité…</option>
                    {copySources(ph).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.text}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn-secondary text-sm" onClick={() => addExtra(ph)}>
                  + Ajouter un {PHASE_NAME[ph]}
                </button>
              </div>
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
                    {!extra && unit.extra.some((x) => x.phase === ph) && (
                      <button className="text-xs text-red-400 hover:underline" onClick={() => removeMain(ph)}>
                        Supprimer ce jeu
                      </button>
                    )}
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
        <header className="mb-3 flex items-end justify-between border-b-4 border-black pb-1.5">
          <div>
            <h1 className="text-[20pt] font-black uppercase leading-none">
              {unit.label}
              {unit.color ? ` — chandail ${PP_COLOR_LABEL[unit.color].toLowerCase()}` : ""}
            </h1>
            <p className="text-[12pt] font-bold capitalize">{format(parseISO(unit.date), "EEEE d MMMM yyyy", { locale: fr })}</p>
          </div>
          <div className="text-right text-[9pt] font-bold">As de Québec M17 AAA — Power Play</div>
        </header>
        {/* Une colonne par phase (In-zone | Breakout | Faceoff) : toute l'unité tient sur UNE feuille.
            La largeur des glaces est calculée pour que la plus haute colonne rentre dans la page, même avec
            plusieurs jeux par phase. */}
        <div className="flex items-start justify-center gap-4 pt-1" style={{ breakInside: "avoid" }}>
          {PHASES.map((ph) => (
            <div key={ph} className="space-y-3" style={{ width: `${colWidths[ph]}mm` }}>
              {mapsOf(ph).map((m) => (
                <section key={m.id} style={{ breakInside: "avoid" }}>
                  {m.id === "main" ? (
                    <h2 className="mb-1.5 rounded-sm bg-black px-2 py-0.5 text-[10pt] font-black uppercase tracking-[0.2em] text-white">{m.title}</h2>
                  ) : (
                    <div className="mb-1.5 h-[6mm] rounded-sm bg-black/80" />
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
