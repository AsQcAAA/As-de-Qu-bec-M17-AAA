/**
 * Suivi de physiothérapie — feuille partagée par la clinique PCN.
 *
 * La clinique tient son propre Google Sheets ; on le lit, on ne l'écrit jamais.
 * Une consultation n'est pas une blessure : un joueur peut passer en dépistage
 * sans rien manquer. Ces lignes s'affichent donc à part, et n'entrent pas dans
 * la chronologie des blessures, qui se déduit des absences.
 */

/** Feuille publique (lecture seule) — export CSV du premier onglet. */
export const PHYSIO_SHEET_ID = "1AlHYb949SuJIo_YXEJn0B4LqgfWp-JgZDPUFvjN2mPc";
export const PHYSIO_SHEET_URL = `https://docs.google.com/spreadsheets/d/${PHYSIO_SHEET_ID}/edit`;
export const PHYSIO_CSV_URL = `https://docs.google.com/spreadsheets/d/${PHYSIO_SHEET_ID}/export?format=csv`;

export interface PhysioRow {
  name: string;
  consultDate: string;
  /** Équipe suivie par la clinique : la feuille couvre toutes les catégories. */
  category: string;
  clinicalImpression: string;
  interventionPlan: string;
  state: string;
  clinicalFollowup: string;
  recommendations: string;
  reviewIn: string;
  appointmentType: string;
}

/**
 * Découpe un CSV en respectant les guillemets : les recommandations de la
 * clinique tiennent sur plusieurs lignes à l'intérieur d'une seule cellule.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** « 31/08/2026 » → « 2026-08-31 ». Retourne null si la date est illisible. */
export function toIsoDate(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Lignes de consultation du CSV.
 *
 * L'en-tête n'est pas en première ligne (la feuille commence par deux lignes de
 * contexte), on la repère donc par son contenu plutôt que par sa position.
 */
export function parsePhysioSheet(csv: string): PhysioRow[] {
  const rows = parseCsv(csv);
  const headerIndex = rows.findIndex((r) => r[0]?.trim().toLowerCase() === "nom");
  if (headerIndex === -1) return [];

  const out: PhysioRow[] = [];
  for (const r of rows.slice(headerIndex + 1)) {
    const name = (r[0] ?? "").trim();
    const date = toIsoDate(r[1] ?? "");
    if (!name || !date) continue;
    out.push({
      name,
      consultDate: date,
      category: (r[2] ?? "").trim(),
      clinicalImpression: (r[3] ?? "").trim(),
      interventionPlan: (r[4] ?? "").trim(),
      state: (r[5] ?? "").trim(),
      clinicalFollowup: (r[6] ?? "").trim(),
      recommendations: (r[7] ?? "").trim(),
      reviewIn: (r[8] ?? "").trim(),
      appointmentType: (r[9] ?? "").trim(),
    });
  }
  return out;
}

/**
 * La clinique suit toutes les équipes du club dans la même feuille. Seule la
 * nôtre nous concerne : les lignes des autres catégories sont ignorées sans
 * bruit — ce ne sont pas des erreurs à signaler.
 */
export const OUR_CATEGORY = "As M17 AAA";

export function isOurCategory(category: string): boolean {
  // Attention : la normalisation des NOMS retire les chiffres, ce qui rendait
  // « As M15 AAA » et « As M17 AAA » identiques. Ici, le chiffre EST la
  // distinction — on garde donc les alphanumériques.
  const normalize = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  return normalize(category) === normalize(OUR_CATEGORY);
}

/** Empreinte du contenu : une correction de la clinique doit se voir. */
export function contentHash(row: PhysioRow): string {
  const raw = [
    row.clinicalImpression,
    row.interventionPlan,
    row.state,
    row.clinicalFollowup,
    row.recommendations,
    row.reviewIn,
    row.appointmentType,
  ].join("|");
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (h * 31 + raw.charCodeAt(i)) | 0;
  }
  return String(h);
}

/** Comparaison de noms tolérante aux accents, espaces et majuscules. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * Un état qui contient « restriction » signale un joueur limité — c'est ce que
 * le coach doit voir en premier.
 */
export function isRestricted(state: string): boolean {
  return state.toLowerCase().includes("restriction");
}

/** Distance d'édition, plafonnée : au-delà de `max`, la valeur exacte importe peu. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Associe un nom de la feuille à un joueur de l'effectif.
 *
 * La clinique saisit les noms à la main : on a déjà vu « Lesvesque » pour
 * « Levesque ». On tolère donc jusqu'à deux caractères d'écart, mais SEULEMENT
 * si un seul joueur est aussi proche — rattacher une note médicale au mauvais
 * joueur serait pire que de ne pas la rattacher du tout.
 */
export function matchPlayerName(
  name: string,
  players: { id: string; full_name: string }[]
): { id: string; exact: boolean } | null {
  const target = normalizeName(name);
  const exact = players.find((p) => normalizeName(p.full_name) === target);
  if (exact) return { id: exact.id, exact: true };

  const close = players.filter((p) => editDistance(target, normalizeName(p.full_name), 2) <= 2);
  return close.length === 1 ? { id: close[0].id, exact: false } : null;
}
