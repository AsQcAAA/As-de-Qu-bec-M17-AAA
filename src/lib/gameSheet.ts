// Lecture de la feuille de match officielle LHEQ.
//
// Bonne nouvelle : le PDF de la ligue est un formulaire (AcroForm), pas une
// image scannée. Chaque donnée est dans un champ nommé, donc l'extraction est
// exacte — aucun OCR, aucune approximation.
//
// Conventions de nommage des champs (suffixe "Loc" = équipe locale,
// "Vis" = visiteur) :
//   TeamNameLoc / TeamNameVis        nom des équipes
//   scoreLoc / scoreVis              POINTAGE FINAL (sans indice)
//   scoreLoc1..N                     n° de chandail du marqueur du but N
//   assistOneLoc1..N / assistTwoLoc  n° de chandail des passeurs du but N
//   goalPeriodLoc1..N / goalTimeLoc  période et temps du but N
//   playerNumLoc1..N / playerNameLoc n° et nom de chaque joueur habillé
//   goalerNumLoc1..N / goalerNameLoc gardiens
//
// Attention : `scoreLoc` (sans chiffre) est le pointage final, alors que
// `scoreLoc1` est le marqueur du 1er but — deux choses différentes.

import { parsePenaltyCode } from "./penalties";
import { computeSpecialTeams, goalSituation } from "./specialTeams";

export type SheetSide = "Loc" | "Vis";

export interface SheetSkaterLine {
  jersey: string;
  sheetName: string;
  goals: number;
  assists: number;
  points: number;
}

export interface SheetGoal {
  index: number;
  period: string | null;
  time: string | null;
  scorerJersey: string | null;
  assistJerseys: string[];
}

/** Un évènement du match, pour le sommaire — les deux équipes confondues. */
export interface SheetEvent {
  side: "us" | "opponent";
  type: "goal" | "penalty";
  period: string | null;
  time: string | null;
  jersey: string | null;
  playerName: string | null;
  /** Buts seulement. */
  assists: { jersey: string; name: string | null }[];
  /** Punitions seulement. */
  code: string | null;
  minutes: number;
  /** Buts seulement : forces égales, avantage ou désavantage numérique. */
  situation?: "even" | "pp" | "sh";
}

export interface SheetPenaltyLine {
  jersey: string;
  sheetName: string | null;
  code: string;
  period: string | null;
  time: string | null;
  minutes: number;
}

export interface SheetGoalieLine {
  jersey: string;
  sheetName: string;
  /** Minutes jouées — 0 si le gardien était sur le banc. */
  minutes: number;
  goalsAgainst: number;
}

export interface ParsedGameSheet {
  gameNum: string | null;
  gameDate: string | null; // "YYYY-MM-DD" si lisible
  location: string | null;
  /**
   * Feuille émise AVANT le match (alignements seulement, aucune statistique).
   * La ligue publie le même gabarit avant et après la partie : sans ce
   * drapeau, un 0-0 non joué serait enregistré comme un vrai match nul.
   */
  isPreGame: boolean;
  teamLoc: string | null;
  teamVis: string | null;
  /** Côté occupé par les As de Québec sur cette feuille. */
  asSide: SheetSide | null;
  opponent: string | null;
  isHome: boolean | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  result: "W" | "L" | "T" | null;
  /** Joueurs des As habillés ce match, avec buts/passes compilés. */
  skaters: SheetSkaterLine[];
  /** Gardiens des As, avec minutes et buts alloués. */
  goalies: SheetGoalieLine[];
  /** Punitions des As, code officiel conservé tel quel. */
  penalties: SheetPenaltyLine[];
  /** Buts et punitions des DEUX équipes, triés chronologiquement. */
  events: SheetEvent[];
  /** Nom de chaque joueur adverse, par numéro — pour le pre-scout. */
  opponentRoster: { jersey: string; name: string }[];
  /** Unités spéciales des As, lues sur la feuille (« A.N: 0 en 3 »). */
  specialTeams: {
    ppGoals: number | null;
    ppOpportunities: number | null;
    pkKills: number | null;
    pkOpportunities: number | null;
  };
  goals: SheetGoal[];
  warnings: string[];
}

const AS_QUEBEC_PATTERNS = ["AS QUEBEC", "AS DE QUEBEC"];

/** Majuscules sans accents ni ponctuation — pour comparer des noms. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents (É → E)
    .replace(/[*()]/g, " ") // "ALEXIS HOULE *" → gardien partant
    .replace(/[^A-Za-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isAsQuebec(teamName: string | null): boolean {
  if (!teamName) return false;
  const n = normalizeName(teamName);
  return AS_QUEBEC_PATTERNS.some((p) => n.includes(p));
}

function val(fields: Record<string, string>, key: string): string | null {
  const v = fields[key];
  return v != null && v.trim() !== "" ? v.trim() : null;
}

/**
 * Numéro du marqueur du but n° i, côté `side`.
 *
 * Incohérence du gabarit de la ligue : côté "Loc", le champ s'appelle
 * `scoreLoc{i}`, mais côté "Vis" c'est `scorerVis{i}` — avec un "r" en plus.
 * Repéré sur un match où les As étaient à domicile : les buts adverses (Vis)
 * ressortaient tous sans marqueur (« #? »). On essaie les deux formes plutôt
 * que de deviner laquelle s'applique.
 */
function scorerJerseyField(fields: Record<string, string>, side: SheetSide, i: number): string | null {
  return val(fields, `score${side}${i}`) ?? val(fields, `scorer${side}${i}`);
}

/**
 * Compile une feuille de match à partir des champs bruts du PDF.
 * Ne touche à aucune base de données — sortie purement calculée, pour être
 * revue à l'écran avant d'être appliquée.
 */
export function parseGameSheet(fields: Record<string, string>): ParsedGameSheet {
  const warnings: string[] = [];

  // La ligue préfixe le nom de "**" quand l'alignement est encore provisoire.
  const cleanTeam = (v: string | null) => (v ? v.replace(/^\*+\s*/, "") : v);
  const teamLoc = cleanTeam(val(fields, "TeamNameLoc"));
  const teamVis = cleanTeam(val(fields, "TeamNameVis"));

  let asSide: SheetSide | null = null;
  if (isAsQuebec(teamLoc)) asSide = "Loc";
  else if (isAsQuebec(teamVis)) asSide = "Vis";
  else warnings.push("Impossible de repérer « As de Québec » sur la feuille — vérifie le nom des équipes.");

  const otherSide: SheetSide | null = asSide === "Loc" ? "Vis" : asSide === "Vis" ? "Loc" : null;

  // Pointage final : le champ sans indice. On recoupe avec le nombre de buts
  // détaillés plus bas, et on signale toute divergence plutôt que de trancher.
  const scoreAs = asSide ? val(fields, `score${asSide}`) : null;
  const scoreOther = otherSide ? val(fields, `score${otherSide}`) : null;
  const goalsFor = scoreAs != null ? Number(scoreAs) : null;
  const goalsAgainst = scoreOther != null ? Number(scoreOther) : null;

  // Buts détaillés du côté des As (marqueur + passeurs).
  const goals: SheetGoal[] = [];
  if (asSide) {
    for (let i = 1; i <= 30; i++) {
      const scorer = scorerJerseyField(fields, asSide, i);
      const a1 = val(fields, `assistOne${asSide}${i}`);
      const a2 = val(fields, `assistTwo${asSide}${i}`);
      const period = val(fields, `goalPeriod${asSide}${i}`);
      const time = val(fields, `goalTime${asSide}${i}`);
      if (!scorer && !a1 && !a2 && !period && !time) continue;
      goals.push({
        index: i,
        period,
        time,
        scorerJersey: scorer,
        assistJerseys: [a1, a2].filter((x): x is string => x != null),
      });
    }
  }

  // Feuille d'avant-match : la ligue remplit l'heure de début/fin seulement une
  // fois la partie jouée ("--:--:--" avant). Le champ TeamLineupIncomplete et
  // les noms d'équipe préfixés de "**" signalent un alignement provisoire.
  const hasDigits = (v: string | null) => v != null && /\d/.test(v);
  const isPreGame =
    goals.length === 0 && !hasDigits(val(fields, "gameStart")) && !hasDigits(val(fields, "gameEnd"));

  if (isPreGame) {
    warnings.push(
      "Cette feuille a été produite AVANT le match (aucune heure de début/fin, aucun but) : il n'y a ni pointage ni statistique à compiler."
    );
    if (val(fields, "TeamLineupIncomplete")) {
      warnings.push("La ligue indique que la composition des équipes n'est pas encore définitive.");
    }
  } else if (goalsFor != null && goals.length !== goalsFor) {
    warnings.push(
      `Le pointage indique ${goalsFor} but(s) mais ${goals.length} but(s) sont détaillés sur la feuille — vérifie avant d'appliquer.`
    );
  }

  // Alignement des As : numéro → nom, tel qu'inscrit sur la feuille.
  const rosterByJersey = new Map<string, string>();
  if (asSide) {
    for (let i = 1; i <= 30; i++) {
      const num = val(fields, `playerNum${asSide}${i}`);
      const name = val(fields, `playerName${asSide}${i}`);
      if (num && name) rosterByJersey.set(num, name);
    }
    for (let i = 1; i <= 5; i++) {
      const num = val(fields, `goalerNum${asSide}${i}`);
      const name = val(fields, `goalerName${asSide}${i}`);
      if (num && name && !rosterByJersey.has(num)) rosterByJersey.set(num, name);
    }
  }

  // Compilation buts / passes par numéro de chandail.
  const tally = new Map<string, { goals: number; assists: number }>();
  const bump = (jersey: string, kind: "goals" | "assists") => {
    const cur = tally.get(jersey) ?? { goals: 0, assists: 0 };
    cur[kind] += 1;
    tally.set(jersey, cur);
  };
  for (const g of goals) {
    if (g.scorerJersey) bump(g.scorerJersey, "goals");
    for (const a of g.assistJerseys) bump(a, "assists");
  }

  const skaters: SheetSkaterLine[] = [...tally.entries()]
    .map(([jersey, t]) => {
      const sheetName = rosterByJersey.get(jersey);
      if (!sheetName) {
        warnings.push(`Le n° ${jersey} apparaît au pointage mais pas dans l'alignement de la feuille.`);
      }
      return {
        jersey,
        sheetName: sheetName ?? `N° ${jersey} (nom absent de la feuille)`,
        goals: t.goals,
        assists: t.assists,
        points: t.goals + t.assists,
      };
    })
    .sort((a, b) => b.points - a.points || Number(a.jersey) - Number(b.jersey));

  // Avant-match : aucun résultat, même si les cases de pointage contiennent "0".
  // Gardiens : la feuille donne les minutes (totalMin…) et les buts alloués
  // (totalGoal…) par gardien, dans le même ordre que goalerNumTotal…
  const goalies: SheetGoalieLine[] = [];
  if (asSide && !isPreGame) {
    for (let i = 1; i <= 5; i++) {
      const num = val(fields, `goalerNumTotal${asSide}${i}`) ?? val(fields, `goalerNum${asSide}${i}`);
      if (!num) continue;
      const minutes = Number(val(fields, `totalMin${asSide}${i}`) ?? "0");
      // totalGoal<côté> = buts alloués par le gardien de CE côté. Vérifié sur la
      // feuille du 13/09/2025 : As (Loc) blanchissent 7-0, totalGoalLoc1 = 0 et
      // totalGoalVis1 = 7.
      const against = Number(val(fields, `totalGoal${asSide}${i}`) ?? "0");
      goalies.push({
        jersey: num,
        sheetName: rosterByJersey.get(num) ?? `N° ${num}`,
        minutes: Number.isFinite(minutes) ? minutes : 0,
        goalsAgainst: Number.isFinite(against) ? against : 0,
      });
    }
  }

  // Punitions : deux blocs sur la feuille, « MINEURES » et « AUTRES »
  // (majeures, inconduites, punitions de match). Même structure de champs.
  const penalties: SheetPenaltyLine[] = [];
  if (asSide) {
    for (const prefix of ["minorPen", "otherPen"]) {
      for (let i = 1; i <= 20; i++) {
        const code = val(fields, `${prefix}${asSide}Code${i}`);
        if (!code) continue;
        const num = val(fields, `${prefix}${asSide}Num${i}`) ?? "";
        penalties.push({
          jersey: num,
          sheetName: rosterByJersey.get(num) ?? null,
          code,
          period: val(fields, `${prefix}${asSide}Period${i}`),
          time: val(fields, `${prefix}${asSide}Time${i}`),
          minutes: parsePenaltyCode(code).minutes,
        });
      }
    }
  }

  // ---- Sommaire : buts et punitions des deux équipes ----
  function rosterOf(side: SheetSide): Map<string, string> {
    const m = new Map<string, string>();
    for (let i = 1; i <= 30; i++) {
      const num = val(fields, `playerNum${side}${i}`);
      const name = val(fields, `playerName${side}${i}`);
      if (num && name) m.set(num, name);
    }
    for (let i = 1; i <= 5; i++) {
      const num = val(fields, `goalerNum${side}${i}`);
      const name = val(fields, `goalerName${side}${i}`);
      if (num && name && !m.has(num)) m.set(num, name);
    }
    return m;
  }

  const events: SheetEvent[] = [];
  if (asSide && otherSide && !isPreGame) {
    for (const side of [asSide, otherSide] as SheetSide[]) {
      const who: "us" | "opponent" = side === asSide ? "us" : "opponent";
      const roster = rosterOf(side);

      for (let i = 1; i <= 30; i++) {
        const scorer = scorerJerseyField(fields, side, i);
        const period = val(fields, `goalPeriod${side}${i}`);
        const time = val(fields, `goalTime${side}${i}`);
        if (!scorer && !period && !time) continue;
        const a1 = val(fields, `assistOne${side}${i}`);
        const a2 = val(fields, `assistTwo${side}${i}`);
        events.push({
          side: who,
          type: "goal",
          period,
          time,
          jersey: scorer,
          playerName: scorer ? (roster.get(scorer) ?? null) : null,
          assists: [a1, a2]
            .filter((x): x is string => !!x)
            .map((j) => ({ jersey: j, name: roster.get(j) ?? null })),
          code: null,
          minutes: 0,
        });
      }

      for (const prefix of ["minorPen", "otherPen"]) {
        for (let i = 1; i <= 20; i++) {
          const code = val(fields, `${prefix}${side}Code${i}`);
          if (!code) continue;
          const num = val(fields, `${prefix}${side}Num${i}`);
          events.push({
            side: who,
            type: "penalty",
            period: val(fields, `${prefix}${side}Period${i}`),
            time: val(fields, `${prefix}${side}Time${i}`),
            jersey: num,
            playerName: num ? (roster.get(num) ?? null) : null,
            assists: [],
            code,
            minutes: parsePenaltyCode(code).minutes,
          });
        }
      }
    }
  }

  // Tri chronologique : période puis temps écoulé.
  const toSeconds = (t: string | null) => {
    const m = t?.match(/(\d+)\s*[:.]\s*(\d+)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };
  events.sort(
    (a, b) => Number(a.period ?? 0) - Number(b.period ?? 0) || toSeconds(a.time) - toSeconds(b.time)
  );

  // Unités spéciales et situation de chaque but : calculées à partir des TEMPS,
  // jamais du résumé écrit par le marqueur — celui-ci s'est révélé faux.
  // Voir src/lib/specialTeams.ts pour les deux règles (inconduites exclues,
  // punitions coïncidentes annulées).
  const st = computeSpecialTeams(
    events.filter((e) => e.type === "penalty").map((e) => ({ side: e.side, period: e.period, time: e.time, code: e.code })),
    events.filter((e) => e.type === "goal").map((e) => ({ side: e.side, period: e.period, time: e.time }))
  );
  for (const e of events) {
    if (e.type !== "goal") continue;
    e.situation = goalSituation({ side: e.side, period: e.period, time: e.time }, st.windows);
  }

  const ppGoals = st.ppGoals;
  const ppOpportunities = st.ppOpportunities;
  const pkKills = st.pkKills;
  const pkOpportunities = st.pkOpportunities;

  // Le résumé du marqueur est conservé à titre indicatif : s'il diverge, on le
  // signale, mais c'est bien le calcul par les temps qui fait foi.
  const parsePair = (v: string | null): [number | null, number | null] => {
    const m = v?.match(/(\d+)\s*en\s*(\d+)/i);
    return m ? [Number(m[1]), Number(m[2])] : [null, null];
  };
  const [sheetPpGoals, sheetPpOpp] = asSide ? parsePair(val(fields, `PP${asSide}`)) : [null, null];
  if (sheetPpGoals != null && (sheetPpGoals !== ppGoals || sheetPpOpp !== ppOpportunities)) {
    warnings.push(
      `Avantage numérique calculé d'après les temps : ${ppGoals} but(s) en ${ppOpportunities} occasion(s). Le résumé du marqueur indiquait ${sheetPpGoals} en ${sheetPpOpp} — c'est le calcul par les temps qui est retenu.`
    );
  }

  const opponentRoster = otherSide
    ? [...rosterOf(otherSide).entries()].map(([jersey, name]) => ({ jersey, name }))
    : [];

  const result =
    isPreGame || goalsFor == null || goalsAgainst == null
      ? null
      : goalsFor > goalsAgainst
        ? "W"
        : goalsFor < goalsAgainst
          ? "L"
          : "T";

  // "2025-09-13 19:00" → "2025-09-13"
  const rawDate = val(fields, "gameDate");
  const dateMatch = rawDate?.match(/\d{4}-\d{2}-\d{2}/);

  return {
    gameNum: val(fields, "gameNum"),
    gameDate: dateMatch ? dateMatch[0] : null,
    location: val(fields, "locationName"),
    isPreGame,
    teamLoc,
    teamVis,
    asSide,
    opponent: otherSide === "Vis" ? teamVis : otherSide === "Loc" ? teamLoc : null,
    isHome: asSide === "Loc" ? true : asSide === "Vis" ? false : null,
    goalsFor: isPreGame ? null : goalsFor,
    goalsAgainst: isPreGame ? null : goalsAgainst,
    result,
    skaters,
    goalies,
    penalties,
    events,
    opponentRoster,
    specialTeams: { ppGoals, ppOpportunities, pkKills, pkOpportunities },
    goals,
    warnings,
  };
}

/** Niveau de confiance d'un rattachement nom-de-feuille → joueur. */
export type MatchConfidence = "exact" | "probable";

export interface PlayerMatch<T> {
  player: T;
  confidence: MatchConfidence;
}

/**
 * Associe un nom lu sur la feuille à un joueur de l'effectif.
 *
 * Le nom prime sur le numéro : les numéros changent d'une saison à l'autre
 * (le n° 6 était Alex Boucher l'an dernier, c'est Alex Blais cette année).
 *
 * Deux niveaux seulement, jamais de devinette silencieuse :
 *  - "exact"    : le nom normalisé est identique → appliqué d'office.
 *  - "probable" : même nom de famille et même initiale (« ALEXANDRE
 *                 LAMONTAGNE » vs « Alek Lamontagne ») → l'interface exige
 *                 une confirmation, parce qu'un homonyme dans la même famille
 *                 ou une recrue portant le nom d'un ancien donnerait des
 *                 points au mauvais joueur.
 * Retourne null si rien de crédible — l'interface fait alors choisir à la main.
 */
export function matchPlayer<T extends { id: string; full_name: string }>(
  sheetName: string,
  players: T[]
): PlayerMatch<T> | null {
  const target = normalizeName(sheetName);
  if (!target) return null;

  const exact = players.filter((p) => normalizeName(p.full_name) === target);
  if (exact.length === 1) return { player: exact[0], confidence: "exact" };

  const parts = target.split(" ");
  const last = parts[parts.length - 1];
  const firstInitial = parts[0]?.[0];
  const loose = players.filter((p) => {
    const n = normalizeName(p.full_name).split(" ");
    return n[n.length - 1] === last && n[0]?.[0] === firstInitial;
  });
  return loose.length === 1 ? { player: loose[0], confidence: "probable" } : null;
}
