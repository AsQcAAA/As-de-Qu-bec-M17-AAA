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

  const byDay = TOURNAMENT_DATES.map((d) => ({
    date: d,
    games: resolved.filter((g) => g.date === d).sort((a, b) => a.time.localeCompare(b.time)),
  }));

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
        <Link href="/calendrier" className="btn-dark">
          ← Calendrier
        </Link>
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

      {byDay.map(({ date, games: dayGames }) => (
        <section key={date} className="space-y-2">
          <h2 className="text-lg font-bold capitalize text-white">{format(parseISO(date), "EEEE d MMMM", { locale: fr })}</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dayGames.map((g) => {
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
                      <button
                        className="text-slate-400 hover:text-slate-700 normal-case"
                        onClick={() => {
                          setEditNo(editNo === g.no ? null : g.no);
                          setDraft({ a: g.scoreA?.toString() ?? "", b: g.scoreB?.toString() ?? "" });
                        }}
                      >
                        {editNo === g.no ? "Annuler" : "Pointage"}
                      </button>
                    </span>
                  </div>
                  <Slot r={g.ra} score={g.scoreA} won={aWon} mine={isOurs(g.ra)} />
                  <Slot r={g.rb} score={g.scoreB} won={bWon} mine={isOurs(g.rb)} />
                  {editNo === g.no && (
                    <div className="flex items-center gap-2 pt-1">
                      <input className="input w-16 text-sm" inputMode="numeric" placeholder="Haut" value={draft.a} onChange={(e) => setDraft({ ...draft, a: e.target.value.replace(/\D/g, "") })} />
                      <input className="input w-16 text-sm" inputMode="numeric" placeholder="Bas" value={draft.b} onChange={(e) => setDraft({ ...draft, b: e.target.value.replace(/\D/g, "") })} />
                      <button className="btn text-xs" onClick={() => saveScore(g.no)}>
                        Enregistrer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-xs text-slate-500">
        {OUR_TEAM.toLowerCase().replace(/^./, (c) => c.toUpperCase())} est en doré. Les cases « Gagnant / Perdant #n » se remplissent toutes seules à mesure que les pointages sont saisis.
      </p>
    </div>
  );
}
