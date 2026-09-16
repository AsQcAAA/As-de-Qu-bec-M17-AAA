/**
 * Lit les courriels d'école du type « Absence à la période d'activité du
 * <date> » (ex. convocation à une période étoilée) pour en extraire le nom
 * du joueur et la date, sans jamais deviner : un courriel qui ne correspond
 * pas exactement au gabarit connu est ignoré plutôt que mal interprété.
 */

const MONTHS: Record<string, string> = {
  janvier: "01",
  fevrier: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Sujet attendu : « Absence à la période d'activité du 22 septembre 2026 ». */
export function isSchoolActivityAbsenceEmail(subject: string): boolean {
  const normalized = stripAccents(subject.toLowerCase());
  return normalized.includes("absence") && normalized.includes("periode d'activite");
}

/** « 22 septembre 2026 » → « 2026-09-22 ». Retourne null si le format ne correspond pas. */
export function extractFrenchDate(text: string): string | null {
  const m = text.match(
    /(\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/i
  );
  if (!m) return null;
  const month = MONTHS[stripAccents(m[2].toLowerCase())];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

/**
 * « Veuillez prendre note que je convoque Eli Desrochers (sec. 4) à une
 * période étoilée... » → « Eli Desrochers ». Le nom précède toujours
 * « (sec. N) » dans ce gabarit — s'il est absent, on ne devine rien.
 */
export function extractConvokedPlayerName(text: string): string | null {
  const m = text.match(/convoque\s+([A-Za-zÀ-ÿ' -]+?)\s*\(\s*sec\.?\s*\d+\s*\)/i);
  return m ? m[1].trim() : null;
}

/**
 * « ...à une période étoilée le 22 septembre... » → « Période étoilée ».
 * Le type de période varie d'une école à l'autre (étoilée, de retenue,
 * dirigée...) — plus précis que la seule raison générique « École ».
 */
export function extractPeriodType(text: string): string | null {
  const m = text.match(/à une période\s+([a-zàâäéèêëïîôöùûüç]+)/i);
  if (!m) return null;
  const word = m[1].toLowerCase();
  return `Période ${word}`;
}

/** Enlève les balises HTML d'un corps de courriel — pour le cas où seul le HTML est fourni. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
