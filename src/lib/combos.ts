import type { GameUnitStats, Player, UnitType } from "./types";

export interface ComboSummary {
  key: string;
  playerIds: string[];
  playerNames: string[];
  unitType: UnitType;
  gamesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  plusMinus: number;
}

// A "combo" is identified by its exact set of players (order-independent),
// so the same trio reassembled under a different label still aggregates
// together across the season.
function comboKey(playerIds: string[]): string {
  return [...playerIds].sort().join("|");
}

export function computeComboSummaries(
  stats: GameUnitStats[],
  players: Player[]
): ComboSummary[] {
  const nameById = new Map(players.map((p) => [p.id, p.full_name]));
  const byKey = new Map<string, ComboSummary>();

  for (const s of stats) {
    if (!s.player_ids || s.player_ids.length === 0) continue;
    const key = `${s.unit_type}:${comboKey(s.player_ids)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.gamesPlayed += 1;
      existing.goalsFor += s.goals_for;
      existing.goalsAgainst += s.goals_against;
      existing.plusMinus += s.plus_minus;
    } else {
      byKey.set(key, {
        key,
        playerIds: s.player_ids,
        playerNames: s.player_ids.map((id) => nameById.get(id) ?? "?"),
        unitType: s.unit_type,
        gamesPlayed: 1,
        goalsFor: s.goals_for,
        goalsAgainst: s.goals_against,
        plusMinus: s.plus_minus,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => b.plusMinus - a.plusMinus);
}
