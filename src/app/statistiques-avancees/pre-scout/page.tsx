"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { OPPONENT_TEAMS, findTeamByOpponent } from "@/lib/lheqTeams";
import { recordsByOpponent, recordLabel } from "@/lib/playerStats";
import type { Game } from "@/lib/types";

export default function PreScoutPage() {
  const supabase = createClient();
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    supabase
      .from("games")
      .select("*")
      .then(({ data }) => setGames(data ?? []));
  }, []);

  // Notre fiche contre chaque équipe, indexée par slug pour être posée sur la
  // tuile correspondante — hors concours exclus, comme la fiche d'équipe.
  const recordBySlug = useMemo(() => {
    const map = new Map<string, ReturnType<typeof recordsByOpponent>[number]>();
    for (const r of recordsByOpponent(games)) {
      const slug = findTeamByOpponent(r.opponent)?.slug;
      if (slug) map.set(slug, r);
    }
    return map;
  }, [games]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pre-Scout</h1>
        <p className="text-slate-500 text-sm">
          Les 20 équipes M17 AAA de la LHEQ, avec notre fiche contre chacune. Clique une équipe pour noter tes
          observations et voir sa fiche.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {OPPONENT_TEAMS.map((team) => {
          const r = recordBySlug.get(team.slug);
          return (
            <Link
              key={team.slug}
              href={`/statistiques-avancees/pre-scout/${team.slug}`}
              className="card flex flex-col items-center gap-2 hover:border-gold-400 transition-colors py-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={team.logo} alt={team.name} className="h-14 w-14 object-contain" />
              <span className="text-sm font-medium text-center">{team.name}</span>
              {r ? (
                <span
                  className={`badge ${
                    r.wins > r.losses
                      ? "bg-green-100 text-green-800"
                      : r.wins < r.losses
                        ? "bg-red-100 text-red-800"
                        : "bg-slate-200 text-slate-700"
                  }`}
                  title={`${r.goalsFor} buts pour, ${r.goalsAgainst} contre`}
                >
                  {recordLabel(r)}
                </span>
              ) : (
                <span className="badge bg-slate-100 text-slate-400">Jamais affrontée</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
