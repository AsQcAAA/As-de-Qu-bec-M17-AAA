"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import {
  OUR_TEAM,
  TOURNAMENT_DATES,
  TOURNAMENT_SLUG,
  TOURNAMENT_TITLE,
  TOURNAMENT_VENUE,
} from "@/lib/tournoiStAugustin";
import { isOurs, nextOurGame, ourGames, resolveTournament, teamDisplay, type ResolvedGame, type ResolvedSlot, type TournamentResult } from "@/lib/tournoi";
import Modal from "@/components/Modal";
import TournamentBracket from "@/components/TournamentBracket";
import type { Game } from "@/lib/types";

const hm = (t: string) => `${t.slice(0, 2)}h${t.slice(3, 5)}`;

export default function TournoiPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const supabase = createClient();
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [zoom, setZoom] = useState(false);
  /** Import du PDF du tournoi : pointages lus, en attente de confirmation. */
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState<{ no: number; teamA: string | null; teamB: string | null; scoreA: number | null; scoreB: number | null }[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [editNo, setEditNo] = useState<number | null>(null);
  const [draft, setDraft] = useState({ a: "", b: "" });

  async function load() {
    const [{ data: res, error: e1 }, { data: gms }] = await Promise.all([
      supabase.from("tournament_results").select("game_no, score_a, score_b").eq("tournament", TOURNAMENT_SLUG),
      supabase.from("games").select("*").in("game_date", TOURNAMENT_DATES),
    ]);
    if (e1) setError("Les pointages ne sont pas encore disponibles (migration 049 à exécuter).");
    setResults((res ?? []) as TournamentResult[]);
    setGames((gms ?? []) as Game[]);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);

  const resolved = useMemo(() => resolveTournament(results), [results]);
  const next = useMemo(() => nextOurGame(resolved), [resolved]);
  const mine = useMemo(() => ourGames(resolved), [resolved]);

  if (slug !== TOURNAMENT_SLUG) return <p className="text-slate-300">Tournoi introuvable.</p>;
  if (loading) return <p className="text-slate-300">Chargement...</p>;

  // Fiche de l'équipe dans le tournoi.
  let w = 0;
  let l = 0;
  for (const g of mine) {
    if (!g.played) continue;
    const ours = isOurs(g.ra) ? g.scoreA! : g.scoreB!;
    const theirs = isOurs(g.ra) ? g.scoreB! : g.scoreA!;
    if (ours > theirs) w++;
    else if (ours < theirs) l++;
  }

  const existingFor = (g: ResolvedGame, opp: string | null) => {
    if (!opp) return null;
    const d = teamDisplay(opp);
    return games.find((x) => x.game_date === g.date && (x.opponent === d.name || x.opponent.toLowerCase() === d.name.toLowerCase())) ?? null;
  };

  async function createNext() {
    if (!next || !next.opponent) return;
    setCreating(true);
    setError(null);
    const g = next.game;
    const opp = teamDisplay(next.opponent).name;
    if (!existingFor(g, next.opponent)) {
      const { error: e } = await supabase.from("games").insert({
        game_date: g.date,
        opponent: opp,
        location: `${g.rink} — Complexe sportif St-Augustin`,
        is_home: null,
        category: "tournoi",
        notes: `${TOURNAMENT_TITLE} — match #${g.no}`,
      });
      if (e) {
        setError(e.message);
        setCreating(false);
        return;
      }
      await supabase.from("schedule_events").insert({
        event_date: g.date,
        start_time: g.time,
        event_type: "game",
        title: `M17 AAA vs ${opp} - ${hm(g.time)} - ${g.rink}`,
      });
    }
    await load();
    setCreating(false);
  }

  async function onPdf(file: File) {
    setImporting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/tournoi/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lecture impossible.");
      setParsed(json.games);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture impossible.");
    } finally {
      setImporting(false);
    }
  }

  async function applyParsed() {
    if (!parsed) return;
    setApplying(true);
    const rows = parsed
      .filter((g) => g.scoreA !== null && g.scoreB !== null && g.scoreA !== g.scoreB)
      .map((g) => ({ tournament: TOURNAMENT_SLUG, game_no: g.no, score_a: g.scoreA!, score_b: g.scoreB!, updated_at: new Date().toISOString() }));
    if (rows.length > 0) {
      const { error: e } = await supabase.from("tournament_results").upsert(rows, { onConflict: "tournament,game_no" });
      if (e) setError(e.message);
    }
    setParsed(null);
    setApplying(false);
    await load();
  }

  function openEdit(no: number) {
    const g = resolved.find((x) => x.no === no);
    setDraft({ a: g?.scoreA?.toString() ?? "", b: g?.scoreB?.toString() ?? "" });
    setEditNo(no);
  }

  async function saveScore(no: number) {
    const a = draft.a.trim();
    const b = draft.b.trim();
    if (a === "" && b === "") {
      await supabase.from("tournament_results").delete().eq("tournament", TOURNAMENT_SLUG).eq("game_no", no);
    } else {
      if (a === "" || b === "" || a === b) {
        setError("Entre deux pointages différents (aucun match nul).");
        return;
      }
      setError(null);
      await supabase
        .from("tournament_results")
        .upsert({ tournament: TOURNAMENT_SLUG, game_no: no, score_a: Number(a), score_b: Number(b), updated_at: new Date().toISOString() }, { onConflict: "tournament,game_no" });
    }
    setEditNo(null);
    await load();
  }

  function Slot({ r, score, won, mine: ours }: { r: ResolvedSlot; score: number | null; won: boolean; mine: boolean }) {
    const t = r.team ? teamDisplay(r.team) : null;
    return (
      <div className={`flex items-center gap-2 py-1 ${won ? "font-black" : ""}`}>
        <div className="h-6 w-6 shrink-0 flex items-center justify-center">
          {t?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo} alt="" className="h-6 w-6 object-contain" />
          ) : null}
        </div>
        <span className={`flex-1 min-w-0 truncate ${t ? "" : "italic text-slate-400"} ${ours ? "text-gold-700" : ""}`}>{t ? t.name : r.pending}</span>
        <span className="w-6 text-right tabular-nums">{score ?? ""}</span>
      </div>
    );
  }

  const firstRound = resolved.filter((g) => g.no <= 11).sort((x, y) => x.time.localeCompare(y.time));

  const nextExisting = next ? existingFor(next.game, next.opponent) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{TOURNAMENT_TITLE}</h1>
          <p className="text-slate-400 text-sm">
            5 au 8 novembre 2026 — {TOURNAMENT_VENUE} · M17 AAA Mixte, 22 équipes
          </p>
          <p className="text-sm font-semibold text-gold-300 mt-1">
            Notre fiche dans le tournoi : {w} V – {l} D
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <label className={`btn cursor-pointer ${importing ? "opacity-60 pointer-events-none" : ""}`}>
            {importing ? "Lecture du PDF…" : "Importer un PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPdf(f);
                e.target.value = "";
              }}
            />
          </label>
          <Link href="/calendrier" className="btn-dark">
            ← Calendrier
          </Link>
        </div>
      </div>

      {/* Prochain match : selon notre adversaire, d'après le tableau. */}
      <section className="card flex items-center justify-between gap-3 flex-wrap">
        {next ? (
          <>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-slate-500">Prochain match</div>
              <div className="font-bold">
                #{next.game.no} — {format(parseISO(next.game.date), "EEEE d MMMM", { locale: fr })}, {hm(next.game.time)} · {next.game.rink}
              </div>
              <div className="text-sm text-slate-600">
                {next.opponent ? `contre ${teamDisplay(next.opponent).name}` : `Adversaire à déterminer${next.waitingOn ? ` — en attente du match #${next.waitingOn}` : ""}`}
              </div>
            </div>
            {nextExisting ? (
              <div className="flex gap-2">
                <Link href={`/jour/${next.game.date}`} className="btn-secondary">
                  Journée
                </Link>
                <Link href={`/resultats/${nextExisting.id}`} className="btn">
                  Ouvrir le match
                </Link>
              </div>
            ) : (
              <button className="btn" disabled={!next.opponent || creating} onClick={createNext}>
                {creating ? "Création..." : "Prochain match →"}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600">
            {mine.length === 0 ? "Notre premier match est le #1 (jeudi 8h00)." : "Plus aucun match prévu pour nous dans le tableau."}
          </p>
        )}
      </section>

      {error && <p className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-sm font-semibold text-amber-100">{error}</p>}

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white">Première ronde — jeudi 5 novembre</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {firstRound.map((g) => {
            const ours = isOurs(g.ra) || isOurs(g.rb);
            const aWon = g.played && g.scoreA! > g.scoreB!;
            const bWon = g.played && g.scoreB! > g.scoreA!;
            const gameRow = ours ? existingFor(g, isOurs(g.ra) ? g.rb.team : g.ra.team) : null;
            return (
              <div key={g.no} className={`card py-2 ${ours ? "ring-2 ring-gold-400" : ""}`}>
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <span>
                    #{g.no} · {hm(g.time)} · {g.rink}
                  </span>
                  <span className="flex items-center gap-2">
                    {gameRow && (
                      <Link href={`/resultats/${gameRow.id}`} className="text-gold-700 hover:underline normal-case">
                        Détail du match
                      </Link>
                    )}
                    <button className="text-slate-400 hover:text-slate-700 normal-case" onClick={() => openEdit(g.no)}>
                      Pointage
                    </button>
                  </span>
                </div>
                <Slot r={g.ra} score={g.scoreA} won={aWon} mine={isOurs(g.ra)} />
                <Slot r={g.rb} score={g.scoreB} won={bWon} mine={isOurs(g.rb)} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-white">Tableau du tournoi</h2>
        <p className="text-xs text-slate-400">Trait doré = gagnant, pointillé gris = perdant. Clique un match pour saisir ou corriger son pointage.</p>
        <div className="relative rounded-2xl bg-black/40 p-3">
          <button
            onClick={() => setZoom(true)}
            title="Voir le tableau en plein écran"
            aria-label="Agrandir le tableau"
            className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 text-ink-900 shadow hover:bg-white"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M15.5 15.5 21 21M10.5 8v5M8 10.5h5" />
            </svg>
          </button>
          <TournamentBracket games={resolved} onEdit={openEdit} />
        </div>
        {zoom && (
          <div className="fixed inset-0 z-50 bg-ink-900 p-3">
            <button
              onClick={() => setZoom(false)}
              aria-label="Fermer"
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-sm font-bold text-ink-900 shadow hover:bg-white"
            >
              ✕ Fermer
            </button>
            <TournamentBracket games={resolved} onEdit={openEdit} contain />
          </div>
        )}
      </section>

      {parsed && (() => {
        const withScores = parsed.filter((g) => g.scoreA !== null && g.scoreB !== null);
        const letters = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
        const rows = withScores.map((g) => {
          const known = resolved.find((x) => x.no === g.no);
          const nm = (r: ResolvedSlot | undefined, fromPdf: string | null) => (r?.team ? teamDisplay(r.team).name : fromPdf ?? r?.pending ?? "?");
          // Équipe lue dans le PDF différente de celle que le tableau attendait : à vérifier.
          const mismatch =
            !!known &&
            ((g.teamA && known.ra.team && !letters(g.teamA).includes(letters(known.ra.team).slice(0, 5))) ||
              (g.teamB && known.rb.team && !letters(g.teamB).includes(letters(known.rb.team).slice(0, 5))));
          const changed = known && (known.scoreA !== g.scoreA || known.scoreB !== g.scoreB);
          return { g, a: nm(known?.ra, g.teamA), b: nm(known?.rb, g.teamB), mismatch: !!mismatch, changed: !!changed };
        });
        const toApply = rows.filter((r) => r.g.scoreA !== r.g.scoreB);
        return (
          <Modal onClose={() => setParsed(null)}>
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white">Pointages lus dans le PDF</h2>
              <div className="card space-y-2">
                {rows.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    Aucun pointage trouvé dans ce PDF ({parsed.length} matchs lus). S&apos;il contient bien des résultats, envoie-le-moi pour que j&apos;adapte la lecture.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      {toApply.length} pointage{toApply.length > 1 ? "s" : ""} à enregistrer ({rows.filter((r) => r.changed).length} nouveau{rows.filter((r) => r.changed).length > 1 ? "x ou modifiés" : " ou modifié"}).
                    </p>
                    <div className="max-h-[50vh] overflow-y-auto divide-y">
                      {rows.map((r) => (
                        <div key={r.g.no} className="flex items-center gap-2 py-1 text-sm">
                          <span className="w-10 text-slate-400">#{r.g.no}</span>
                          <span className="flex-1 truncate">
                            {r.a} <b>{r.g.scoreA}</b> – <b>{r.g.scoreB}</b> {r.b}
                          </span>
                          {r.mismatch && <span className="text-xs font-bold text-amber-600">équipes à vérifier</span>}
                          {!r.changed && <span className="text-xs text-slate-400">déjà saisi</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex gap-2 pt-1">
                  {rows.length > 0 && (
                    <button className="btn" onClick={applyParsed} disabled={applying}>
                      {applying ? "Enregistrement…" : "Mettre à jour le tableau"}
                    </button>
                  )}
                  <button className="btn-secondary" onClick={() => setParsed(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}

      {editNo !== null && (() => {
        const g = resolved.find((x) => x.no === editNo)!;
        const nm = (r: ResolvedSlot) => (r.team ? teamDisplay(r.team).name : r.pending);
        return (
          <Modal onClose={() => setEditNo(null)}>
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white">
                Match #{g.no} — {format(parseISO(g.date), "EEEE d MMMM", { locale: fr })}, {hm(g.time)} · {g.rink}
              </h2>
              <div className="card space-y-3">
                <label className="flex items-center gap-3">
                  <span className="flex-1">{nm(g.ra)}</span>
                  <input className="input w-20" inputMode="numeric" value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value.replace(/\D/g, "") })} />
                </label>
                <label className="flex items-center gap-3">
                  <span className="flex-1">{nm(g.rb)}</span>
                  <input className="input w-20" inputMode="numeric" value={draft.b} onChange={(e) => setDraft({ ...draft, b: e.target.value.replace(/\D/g, "") })} />
                </label>
                <p className="text-xs text-slate-500">Laisse les deux cases vides pour effacer le pointage.</p>
                {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <button className="btn" onClick={() => saveScore(g.no)}>
                    Enregistrer
                  </button>
                  <button className="btn-secondary" onClick={() => setEditNo(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        );
      })()}

      <p className="text-xs text-slate-500">
        {OUR_TEAM.toLowerCase().replace(/^./, (c) => c.toUpperCase())} est en doré. Les cases « Gagnant / Perdant #n » se remplissent toutes seules à mesure que les pointages sont saisis.
      </p>
    </div>
  );
}
