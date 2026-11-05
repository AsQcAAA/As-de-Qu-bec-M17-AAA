import type { SupabaseClient } from "@supabase/supabase-js";
import type { Game, Lineup } from "@/lib/types";
import { pickGameOfDay } from "@/lib/dayGame";

/** Matchs d'une journée, dans l'ordre de création (= ordre chronologique du tableau). */
export async function loadDayGames(supabase: SupabaseClient, date: string): Promise<Game[]> {
  const { data } = await supabase.from("games").select("*").eq("game_date", date).order("created_at");
  return (data ?? []) as Game[];
}

/** Match retenu : celui demandé (?game=…) s'il existe, sinon le prochain à jouer. */
export function selectGame(games: Game[], preferredId?: string | null): Game | null {
  return games.find((g) => g.id === preferredId) ?? pickGameOfDay(games);
}

/**
 * Alignement d'un match. Les jours à plusieurs matchs, chaque match a le sien (game_id) ;
 * les autres jours, l'alignement est celui de la journée.
 */
export async function findLineup(supabase: SupabaseClient, date: string, game: Game | null, gameCount: number): Promise<Lineup | null> {
  if (game && gameCount > 1) {
    const { data } = await supabase.from("lineups").select("*").eq("game_id", game.id).limit(1);
    return ((data ?? [])[0] as Lineup | undefined) ?? null;
  }
  const { data } = await supabase.from("lineups").select("*").eq("lineup_date", date).order("created_at").limit(1);
  return ((data ?? [])[0] as Lineup | undefined) ?? null;
}

/** Lien vers l'alignement d'un match (avec ?game= quand la journée en compte plusieurs). */
export function lineupHref(date: string, game: { id: string } | null | undefined, gameCount: number, extra = ""): string {
  const q: string[] = [];
  if (game && gameCount > 1) q.push(`game=${game.id}`);
  if (extra) q.push(extra);
  return `/jour/${date}/alignement${q.length ? `?${q.join("&")}` : ""}`;
}
