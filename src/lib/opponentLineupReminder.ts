import { addDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findTeamByOpponent } from "./lheqTeams";
import { RESULT_LABEL } from "./gameResults";
import type { Game } from "./types";

export interface MissingLineupGame {
  game: Game;
  teamName: string;
}

/**
 * Matchs du week-end précédent (vendredi à dimanche, vus depuis un lundi) déjà
 * joués dont l'alignement adverse n'a pas été saisi dans l'app.
 */
export async function findMissingOpponentLineups(
  supabase: SupabaseClient,
  mondayKey: string
): Promise<MissingLineupGame[]> {
  const monday = parseISO(mondayKey);
  const from = format(addDays(monday, -3), "yyyy-MM-dd");
  const to = format(addDays(monday, -1), "yyyy-MM-dd");

  const { data: games } = await supabase
    .from("games")
    .select("*")
    .gte("game_date", from)
    .lte("game_date", to)
    .not("result", "is", null)
    .order("game_date");
  if (!games || games.length === 0) return [];

  const { data: lineups } = await supabase
    .from("game_opponent_lineups")
    .select("game_id, slots")
    .in("game_id", games.map((g) => g.id));
  const filled = new Set(
    (lineups ?? [])
      .filter((l) => Object.values((l.slots ?? {}) as Record<string, { n?: string }>).some((v) => v?.n))
      .map((l) => l.game_id)
  );

  return (games as Game[])
    .filter((g) => !filled.has(g.id))
    .map((game) => ({ game, teamName: findTeamByOpponent(game.opponent)?.name ?? game.opponent }));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildMissingLineupEmail(missing: MissingLineupGame[], origin: string, firstName: string) {
  const many = missing.length > 1;
  const subject = `📋 Alignement adverse à saisir — ${many ? `${missing.length} matchs` : missing[0].teamName}`;
  const items = missing
    .map(({ game, teamName }) => {
      const date = format(parseISO(game.game_date), "EEEE d MMMM", { locale: fr });
      const score =
        game.goals_for != null && game.goals_against != null
          ? ` · ${game.goals_for}–${game.goals_against}${game.result ? ` (${RESULT_LABEL[game.result]})` : ""}`
          : "";
      const where = game.is_home ? "à domicile" : "à l'étranger";
      return `<li style="margin:0 0 10px"><strong style="text-transform:capitalize">${esc(date)}</strong> — ${esc(teamName)}, ${where}${esc(score)}<br><a href="${origin}/resultats/${game.id}" style="color:#b8860b;font-weight:bold">Saisir l'alignement adverse →</a></li>`;
    })
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;line-height:1.5">
<p>Bonjour ${esc(firstName)},</p>
<p>L'alignement adverse n'a pas encore été saisi dans l'app pour ${many ? "ces matchs" : "ce match"} du week-end dernier :</p>
<ul style="padding-left:18px">${items}</ul>
<p>Il suffit d'entrer les numéros de chaque joueur adverse : les noms s'affichent tout seuls d'après l'effectif de l'équipe. Ça prend deux minutes.</p>
<p style="color:#666">— App As de Québec M17 AAA (rappel automatique du lundi)</p>
</div>`;
  const text = [
    `Bonjour ${firstName},`,
    "",
    `L'alignement adverse n'a pas encore été saisi dans l'app pour ${many ? "ces matchs" : "ce match"} du week-end dernier :`,
    ...missing.map(
      ({ game, teamName }) => `- ${game.game_date} — ${teamName} : ${origin}/resultats/${game.id}`
    ),
    "",
    "Il suffit d'entrer les numéros de chaque joueur adverse : les noms s'affichent tout seuls.",
  ].join("\n");
  return { subject, html, text };
}
