"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { findTeamByOpponent } from "@/lib/lheqTeams";
import { matchupLabel, scoreInDisplayOrder } from "@/lib/gameResults";
import type { DailyReport, Game } from "@/lib/types";

/** Les quatre points du plan de match, dans l'ordre où ils sont saisis. */
function planPoints(g: Game): string[] {
  return [g.plan_point_1, g.plan_point_2, g.plan_point_3, g.plan_point_4].filter(
    (p): p is string => !!p && p.trim() !== ""
  );
}

export default function RapportsPage() {
  const supabase = createClient();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: rows }, { data: gms }] = await Promise.all([
        supabase.from("daily_reports").select("*").order("report_date", { ascending: false }),
        supabase.from("games").select("*").order("game_date", { ascending: false }),
      ]);
      setReports(rows ?? []);
      setGames(gms ?? []);
      setLoading(false);
    }
    load();
  }, []);

  // On ne liste que les matchs dont le plan est écrit : un match sans plan
  // n'apprend rien ici, et la liste complète de la saison noierait le reste.
  const gamesWithPlan = games.filter((g) => planPoints(g).length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Rapports</h1>
        <p className="text-slate-400 text-sm">
          Lecture seule — clique sur une journée pour remplir ou modifier son contenu.
        </p>
      </div>

      {/* ---- Game plans ---- */}
      <section className="space-y-3">
        <h2 className="font-semibold">
          🥅 Game plan par match{gamesWithPlan.length > 0 ? ` (${gamesWithPlan.length})` : ""}
        </h2>
        {loading ? (
          <p className="text-slate-500">Chargement...</p>
        ) : gamesWithPlan.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun plan de match écrit. Le plan se remplit depuis l&apos;écran d&apos;alignement du match.
          </p>
        ) : (
          <div className="space-y-3">
            {gamesWithPlan.map((g) => {
              const team = findTeamByOpponent(g.opponent);
              return (
                <Link
                  key={g.id}
                  href={`/jour/${g.game_date}/alignement`}
                  className="card block hover:border-gold-400 transition-colors space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {team?.logo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={team.logo} alt={team.name} className="h-6 w-6 shrink-0 object-contain" />
                    )}
                    <span className="font-medium capitalize">
                      {format(parseISO(g.game_date), "d MMMM yyyy", { locale: fr })}
                    </span>
                    <span className="text-slate-500 text-sm">{matchupLabel(g, team?.name)}</span>
                    {g.result && (
                      <span className="badge bg-slate-200 text-slate-700">
                        {g.result} {scoreInDisplayOrder(g)}
                      </span>
                    )}
                  </div>
                  <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside">
                    {planPoints(g).map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ol>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Rapports de pratique ---- */}
      <section className="space-y-3">
        <h2 className="font-semibold">🏒 Rapports des pratiques ({reports.length})</h2>
        {loading ? (
          <p className="text-slate-500">Chargement...</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun rapport enregistré.</p>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <Link
                key={r.id}
                href={`/jour/${r.report_date}`}
                className="card block hover:border-gold-400 transition-colors"
              >
                <div className="font-medium mb-2 capitalize">
                  {format(parseISO(r.report_date), "d MMMM yyyy", { locale: fr })}
                </div>
                <dl className="text-sm text-slate-600 space-y-1">
                  {r.meeting_theme && (
                    <div>
                      <span className="font-medium">Thème du meeting :</span> {r.meeting_theme}
                    </div>
                  )}
                  {r.practice_theme && (
                    <div>
                      <span className="font-medium">Thème de la pratique :</span> {r.practice_theme}
                    </div>
                  )}
                  {r.coach_notes && (
                    <div>
                      <span className="font-medium">Notes :</span> {r.coach_notes}
                    </div>
                  )}
                  {!r.meeting_theme && !r.practice_theme && !r.coach_notes && (
                    <div className="text-slate-400">Rapport vide.</div>
                  )}
                </dl>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
