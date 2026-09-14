/**
 * Chronologie des blessures, déduite des données déjà saisies.
 *
 * Rien n'est enregistré à part : une blessure est une SÉQUENCE d'absences pour
 * blessure, bornée par le retour au jeu. Le coach ne saisit donc jamais deux
 * fois la même information.
 *
 * Règles retenues :
 *  - La blessure commence à la PREMIÈRE activité ratée.
 *  - Elle est « guérie » dès que le joueur figure dans un alignement daté
 *    APRÈS sa dernière absence — c'est le signal explicite du coach.
 *  - Entre les deux, si une pratique est passée sans qu'il soit porté absent,
 *    il est de retour à l'entraînement : « en réhabilitation ».
 *  - Un joueur qui rate de nouveau une activité après être revenu ouvre une
 *    NOUVELLE blessure, jamais une reprise de l'ancienne.
 */

export type InjuryPhase = "active" | "rehab" | "guerie";

export interface InjuryEpisode {
  playerId: string;
  /** Première activité ratée. */
  startDate: string;
  /** Dernière activité ratée de cette séquence. */
  lastMissedDate: string;
  /** Date du premier alignement qui le remet en jeu, si elle existe. */
  healedDate: string | null;
  missedDates: string[];
  /** Séances patinées sans contact pendant cet épisode. */
  noContactDates: string[];
  phase: InjuryPhase;
}

export interface InjuryInputs {
  /** Dates d'absence pour blessure, du joueur. */
  injuryDates: string[];
  /** Dates où le joueur figure dans un alignement. */
  lineupDates: string[];
  /** Séances patinées SANS CONTACT : le joueur est là, mais pas rétabli. */
  noContactDates: string[];
  /** Toutes les dates de pratique de la saison. */
  practiceDates: string[];
  /** Toutes les dates où le joueur a été porté absent, quelle qu'en soit la raison. */
  absentDates: string[];
  /** Date du jour, au format YYYY-MM-DD. */
  today: string;
}

export function buildInjuryEpisodes(playerId: string, input: InjuryInputs): InjuryEpisode[] {
  const injuries = [...new Set(input.injuryDates)].sort();
  if (injuries.length === 0) return [];

  // Une séance sans contact ne remet pas le joueur en jeu : il est sur la
  // glace, mais l'épisode continue. Sans cette exclusion, sa présence dans
  // l'alignement du jour déclarait la blessure guérie.
  const noContact = new Set(input.noContactDates);
  const lineups = [...new Set(input.lineupDates)].filter((d) => !noContact.has(d)).sort();
  // Seules les pratiques DÉJÀ PASSÉES prouvent un retour à l'entraînement :
  // une séance à venir ne dit rien de l'état du joueur.
  const practices = [...new Set(input.practiceDates)].filter((d) => d <= input.today).sort();
  const absent = new Set(input.absentDates);

  /** Premier retour au jeu strictement après une date donnée. */
  const returnAfter = (date: string) => lineups.find((d) => d > date) ?? null;

  // Regroupement : un retour au jeu entre deux absences coupe la séquence.
  const groups: string[][] = [];
  let current: string[] = [injuries[0]];
  for (let i = 1; i < injuries.length; i++) {
    const previous = current[current.length - 1];
    const back = returnAfter(previous);
    if (back && back < injuries[i]) {
      groups.push(current);
      current = [injuries[i]];
    } else {
      current.push(injuries[i]);
    }
  }
  groups.push(current);

  return groups.map((missedDates) => {
    const lastMissedDate = missedDates[missedDates.length - 1];
    const healedDate = returnAfter(lastMissedDate);

    let phase: InjuryPhase;
    if (healedDate) {
      phase = "guerie";
    } else {
      // Revenu à l'entraînement : une pratique est passée sans absence. Une
      // séance sans contact compte aussi — c'est précisément de la réhabilitation.
      const backAtPractice =
        practices.some((d) => d > lastMissedDate && !absent.has(d)) ||
        [...noContact].some((d) => d > lastMissedDate);
      phase = backAtPractice ? "rehab" : "active";
    }

    const episodeNoContact = [...noContact]
      .filter((d) => d >= missedDates[0] && (!healedDate || d <= healedDate))
      .sort();

    return {
      playerId,
      startDate: missedDates[0],
      lastMissedDate,
      healedDate,
      missedDates,
      noContactDates: episodeNoContact,
      phase,
    };
  });
}

export const PHASE_LABEL: Record<InjuryPhase, string> = {
  active: "Blessé",
  rehab: "En réhabilitation",
  guerie: "Guérie",
};

/** Bandeaux : or plein tant qu'il est blessé, or pâle en réhabilitation, gris une fois guérie. */
export const PHASE_STYLE: Record<InjuryPhase, string> = {
  active: "bg-gold-500 text-ink-900 border-gold-600",
  rehab: "bg-gold-100 text-ink-900 border-gold-300",
  guerie: "bg-slate-100 text-slate-600 border-slate-300",
};
