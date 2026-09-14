import { differenceInCalendarDays, isBefore, parseISO } from "date-fns";
import type { Meeting, Player } from "./types";

export const OVERDUE_DAYS = 21;

// Les alertes de rencontres individuelles en retard ne doivent commencer
// qu'à partir de la semaine du 7 septembre (début réel du suivi).
export const MEETING_ALERTS_START = new Date(2026, 8, 7); // mois 0-indexé : 8 = septembre

export interface PlayerMeetingStatus {
  player: Player;
  lastMeetingDate: string | null;
  daysSince: number | null;
  overdue: boolean;
}

// For each active player, find their most recent individual meeting and
// flag anyone who has gone 3+ weeks (or never met) without one.
export function computeMeetingStatuses(
  players: Player[],
  meetings: Meeting[],
  today: Date = new Date()
): PlayerMeetingStatus[] {
  const alertsActive = !isBefore(today, MEETING_ALERTS_START);
  const individual = meetings.filter((m) => m.meeting_type === "individual" && m.player_id);
  const lastByPlayer = new Map<string, string>();
  for (const m of individual) {
    const current = lastByPlayer.get(m.player_id!);
    if (!current || m.meeting_date > current) {
      lastByPlayer.set(m.player_id!, m.meeting_date);
    }
  }

  return players
    .filter((p) => p.active)
    .map((player) => {
      const lastMeetingDate = lastByPlayer.get(player.id) ?? null;
      const daysSince = lastMeetingDate
        ? differenceInCalendarDays(today, parseISO(lastMeetingDate))
        : null;
      const overdue = alertsActive && (daysSince === null || daysSince >= OVERDUE_DAYS);
      return { player, lastMeetingDate, daysSince, overdue };
    })
    .sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999));
}
