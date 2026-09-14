import type { GameUnitStats, Player } from "./types";

export interface Affinity {
  playerId: string;
  playerName: string;
  sharedUnits: number;
  goalsFor: number;
}

// For a given player, find which teammates they shared a lineup unit with
// most often, and how many goals those shared units produced — a proxy for
// "who they've generated offence with" since we don't track point-by-point
// on-ice attribution.
export function computeTopAffinities(
  playerId: string,
  stats: GameUnitStats[],
  players: Player[],
  limit = 3
): Affinity[] {
  const nameById = new Map(players.map((p) => [p.id, p.full_name]));
  const totals = new Map<string, { sharedUnits: number; goalsFor: number }>();

  for (const s of stats) {
    if (!s.player_ids.includes(playerId)) continue;
    for (const mateId of s.player_ids) {
      if (mateId === playerId) continue;
      const entry = totals.get(mateId) ?? { sharedUnits: 0, goalsFor: 0 };
      entry.sharedUnits += 1;
      entry.goalsFor += s.goals_for;
      totals.set(mateId, entry);
    }
  }

  return [...totals.entries()]
    .map(([mateId, v]) => ({
      playerId: mateId,
      playerName: nameById.get(mateId) ?? "?",
      sharedUnits: v.sharedUnits,
      goalsFor: v.goalsFor,
    }))
    .sort((a, b) => b.goalsFor - a.goalsFor || b.sharedUnits - a.sharedUnits)
    .slice(0, limit);
}
