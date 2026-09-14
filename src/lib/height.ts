/**
 * Grandeurs : affichées en pieds et pouces, stockées en centimètres.
 *
 * Le centimètre reste la valeur en base — c'est une seule unité, sans virgule
 * et sans ambiguïté. La conversion se fait à l'affichage et à la saisie, au
 * demi-pouce près : c'est la précision à laquelle un joueur est mesuré, et
 * l'aller-retour cm → pi/po → cm redonne exactement la mesure d'origine.
 */

/** 187 → « 6'1½" ». Retourne null si la taille est inconnue. */
export function formatHeight(cm: number | null | undefined): string | null {
  if (cm == null || cm <= 0) return null;
  const halves = Math.round((cm / 2.54) * 2) / 2;
  const feet = Math.floor(halves / 12);
  const inches = halves - feet * 12;
  const whole = Math.floor(inches);
  const half = inches - whole >= 0.5;
  return `${feet}'${whole}${half ? "½" : ""}"`;
}

/**
 * Lit une saisie en pieds et pouces : « 6'1½" », « 6'1.5 », « 6 1 1/2 »,
 * « 5-11 ». Retourne des centimètres, ou null si rien d'exploitable.
 */
export function parseHeight(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  // Une valeur seule et grande est déjà des centimètres (saisie héritée).
  const seul = raw.match(/^(\d{2,3})\s*(cm)?$/i);
  if (seul && Number(seul[1]) > 90) return Number(seul[1]);

  const m = raw.match(/^(\d+)\s*(?:'|’|pi|ft|-|\s)\s*(\d+)?\s*(½|1\/2|\.5)?/i);
  if (!m) return null;
  const feet = Number(m[1]);
  const inches = Number(m[2] ?? 0) + (m[3] ? 0.5 : 0);
  if (!Number.isFinite(feet) || inches >= 12) return null;
  return Math.round((feet * 12 + inches) * 2.54);
}
