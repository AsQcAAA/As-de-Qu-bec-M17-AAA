export type UnitType = "forward_line" | "defense_pair" | "powerplay" | "penalty_kill";
export type EventType =
  | "game"
  | "practice"
  | "team_meeting"
  | "individual_meeting"
  | "team_building"
  | "pp_meeting"
  | "training"
  | "other"
  | "reminder";
export type GameResult = "W" | "L" | "OTL" | "SOL" | "T";
export type GameCategory = "hors_concours" | "saison_reguliere" | "series" | "tournoi";
export type MeetingType = "individual" | "collective";
export type CoachRole = "head_coach" | "assistant";
export type InjurySeverity = "legere" | "moderee" | "grave";
export type InjuryStatus = "active" | "resolue";
/**
 * « sans_contact » n'est pas une absence : le joueur a patiné, mais sans
 * contact. Rangé ici parce que c'est la même saisie, au même moment.
 */
export type AbsenceReason =
  | "malade"
  | "blesse"
  | "ecole"
  | "remplacement_m18"
  | "non_justifie"
  | "suspendu"
  | "sans_contact";

export interface CoachProfile {
  id: string;
  full_name: string;
  role: CoachRole;
  created_at: string;
}

export interface Player {
  id: string;
  full_name: string;
  jersey_number: number | null;
  position: "F" | "D" | "G" | null;
  active: boolean;
  is_call_up: boolean;
  photo_url: string | null;
  height_cm: number | null;
  weight_lbs: number | null;
  xg_per_60: number | null;
  toi_per_60: number | null;
  faceoff_pct: number | null;
  controlled_exits_pct: number | null;
  shots_on_goal_season: number | null;
  responsibility: string | null;
  priority_order: number | null;
  objective_1: string | null;
  objective_2: string | null;
  objective_3: string | null;
  tpe_profile_url: string | null;
  created_at: string;
}

export interface CalendarDayNote {
  day: string;
  notes: string | null;
  updated_at: string;
}

export interface ResponsibilityCategory {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface ResponsibilityLog {
  id: string;
  log_date: string;
  player_id: string;
  category: string;
  created_at: string;
}

export interface ScheduleEvent {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  event_type: EventType;
  title: string;
  location: string | null;
  notes: string | null;
}

export interface Lineup {
  id: string;
  lineup_date: string;
  event_id: string | null;
  notes: string | null;
  /** Dernier entraîneur à avoir touché cet alignement — visible à l'entraîneur-chef seulement. */
  updated_by: string | null;
}

export interface LineupUnit {
  id: string;
  lineup_id: string;
  unit_type: UnitType;
  unit_label: string;
  color_group: string | null;
  unit_order: number;
  player_ids: string[];
}

export interface Game {
  id: string;
  game_date: string;
  opponent: string;
  location: string | null;
  is_home: boolean | null;
  result: GameResult | null;
  goals_for: number | null;
  goals_against: number | null;
  external_link: string | null;
  lineup_id: string | null;
  notes: string | null;
  plan_point_1: string | null;
  plan_point_2: string | null;
  plan_point_3: string | null;
  plan_point_4: string | null;
  bus_departure_time: string | null;
  category: GameCategory;
  /** Unités spéciales, lues sur la feuille de match. */
  pp_goals: number | null;
  pp_opportunities: number | null;
  pk_kills: number | null;
  pk_opportunities: number | null;
  /** Rapport de statistiques avancées TPE — équipe. Voir src/lib/tpeReport.ts. */
  shots_on_goal_us: number | null;
  shots_on_goal_opponent: number | null;
  shots_breakdown: TpeShotsBreakdown | null;
  faceoffs_us_won: number | null;
  faceoffs_us_lost: number | null;
  faceoff_breakdown: TpeFaceoffBreakdown | null;
  /** Les 9 ronds de mise au jeu du diagramme « Face-Offs by zones » du rapport. */
  faceoff_zone_map: TpeFaceoffZoneGrid | null;
  team_xg_us: number | null;
  team_xg_opponent: number | null;
}

/** Une ligne « tirs / tirs au but / buts » du rapport TPE. */
export interface TpeShotsLine {
  shotAttempts: number;
  shotsOnGoal: number;
  goals: number;
}

export interface TpeShotsBreakdown {
  us: Record<"total" | "p1" | "p2" | "p3" | "pp" | "pk" | "even", TpeShotsLine>;
  opponent: Record<"total" | "p1" | "p2" | "p3" | "pp" | "pk" | "even", TpeShotsLine>;
}

/** Une ligne « mises au jeu gagnées/perdues » du rapport TPE. */
export interface TpeFaceoffLine {
  won: number;
  lost: number;
}

/** Mises au jeu — As de Québec seulement. */
export interface TpeFaceoffBreakdown {
  total: TpeFaceoffLine;
  p1: TpeFaceoffLine;
  p2: TpeFaceoffLine;
  p3: TpeFaceoffLine;
  pp: TpeFaceoffLine;
  pk: TpeFaceoffLine;
  even: TpeFaceoffLine;
  dz: TpeFaceoffLine;
  nz: TpeFaceoffLine;
  oz: TpeFaceoffLine;
}

/**
 * Les 9 ronds de mise au jeu du diagramme « Face-Offs by zones » — voir
 * TpeFaceoffZoneGrid dans src/lib/tpeReport.ts pour le détail des positions.
 */
export interface TpeFaceoffZoneGrid {
  dzTop: TpeFaceoffLine;
  dzBottom: TpeFaceoffLine;
  nzDefTop: TpeFaceoffLine;
  nzDefBottom: TpeFaceoffLine;
  center: TpeFaceoffLine;
  nzOffTop: TpeFaceoffLine;
  nzOffBottom: TpeFaceoffLine;
  ozTop: TpeFaceoffLine;
  ozBottom: TpeFaceoffLine;
}

/** Une ligne du rapport TPE — un joueur des As de Québec, pour un match. */
export interface PlayerGameAdvancedStat {
  id: string;
  game_id: string;
  player_id: string;
  toi_seconds: number | null;
  shots_on_goal: number | null;
  faceoffs_won: number | null;
  faceoffs_lost: number | null;
  plus_minus: number | null;
  on_ice_xg_for: number | null;
  on_ice_xg_against: number | null;
  on_ice_xg_for_per20: number | null;
  on_ice_xg_against_per20: number | null;
  xg: number | null;
  xg_per20: number | null;
  created_at: string;
}

export interface GameUnitStats {
  id: string;
  game_id: string;
  lineup_unit_id: string | null;
  unit_type: UnitType;
  unit_label: string;
  player_ids: string[];
  goals_for: number;
  goals_against: number;
  plus_minus: number;
  shifts: number | null;
  notes: string | null;
}

export interface Meeting {
  id: string;
  meeting_date: string;
  meeting_type: MeetingType;
  player_id: string | null;
  topic: string | null;
  notes: string | null;
  /** Entraîneur qui a écrit/modifié en dernier cette rencontre — visible à l'entraîneur-chef seulement. */
  updated_by: string | null;
}

export interface DailyReport {
  id: string;
  report_date: string;
  energy_level: number | null;
  team_mood: string | null;
  injuries: string | null;
  academic_notes: string | null;
  key_events: string | null;
  coach_notes: string | null;
  practice_theme: string | null;
  meeting_theme: string | null;
  submitted_at: string;
  /** Entraîneur qui a écrit/modifié en dernier ce rapport — visible à l'entraîneur-chef seulement. */
  updated_by: string | null;
}

export interface WeeklyTheme {
  week_start: string;
  theme: string | null;
  notes: string | null;
  created_at: string;
}

export interface TeamBuildingLog {
  log_date: string;
  theme: string | null;
  notes: string | null;
  created_at: string;
}

export interface PracticeBlock {
  id: string;
  practice_date: string;
  position: number;
  title: string | null;
  duration_minutes: number | null;
  description: string | null;
}

export interface ScoutNote {
  id: string;
  team_slug: string;
  wins: number | null;
  losses: number | null;
  otl_losses: number | null;
  last5: string | null;
  notes: string | null;
  updated_at: string;
}

export interface Absence {
  id: string;
  player_id: string;
  absence_date: string;
  reason: AbsenceReason | null;
  created_at: string;
}

export interface DailyCheck {
  check_date: string;
  completed_at: string;
}

export interface PlayerTestResult {
  id: string;
  player_id: string;
  test_name: string;
  value: number;
  unit: string | null;
  higher_is_better: boolean;
  test_date: string;
  notes: string | null;
}

export interface Injury {
  id: string;
  player_id: string | null;
  injury_date: string;
  description: string;
  severity: InjurySeverity | null;
  status: InjuryStatus;
  notes: string | null;
  reported_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface PlayerGameStat {
  id: string;
  player_id: string;
  game_id: string;
  goals: number;
  assists: number;
  toi_minutes: number | null;
  shots_on_goal: number | null;
  /** Buts alloués — gardiens seulement (null pour un patineur). */
  goals_against: number | null;
  created_at: string;
}

export interface MonthlyNote {
  month: string;
  notes: string | null;
  updated_at: string;
}

export type Zone = "offensive" | "neutre" | "defensive";

export interface GameZoneStat {
  id: string;
  game_id: string;
  zone: Zone;
  faceoffs_won: number;
  faceoffs_lost: number;
  created_at: string;
}

export interface FarandoleAssignment {
  assignment_date: string;
  player_ids: string[];
  updated_at: string;
}

export interface DgNote {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export type GameDocumentType = "feuille_match" | "stats_avancees" | "plus_moins";

export interface GameDocument {
  id: string;
  game_id: string;
  doc_type: GameDocumentType;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
}

export interface GameEvent {
  id: string;
  game_id: string;
  side: "us" | "opponent";
  event_type: "goal" | "penalty";
  period: string | null;
  time: string | null;
  player_id: string | null;
  player_name: string | null;
  jersey_number: number | null;
  assist1_name: string | null;
  assist1_jersey: number | null;
  assist1_player_id: string | null;
  assist2_name: string | null;
  assist2_jersey: number | null;
  assist2_player_id: string | null;
  penalty_code: string | null;
  /** Buts seulement : "even" | "pp" | "sh". Déduit des punitions actives. */
  situation: "even" | "pp" | "sh" | null;
  created_at: string;
}

export interface Penalty {
  id: string;
  game_id: string;
  player_id: string | null;
  jersey_number: number | null;
  /** Code officiel de la ligue, ex. « A22 ». Les minutes s'en déduisent. */
  code: string;
  period: string | null;
  time: string | null;
  created_at: string;
}
