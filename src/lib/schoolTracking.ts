/**
 * Suivi scolaire des 5 équipes de l'organisation : association des noms
 * d'élèves des courriels de l'école aux joueurs, et contenu du bilan des
 * périodes étoilées envoyé à chaque entraîneur.
 */
import { escapeHtml } from "@/lib/emailTemplate";

export interface RosterEntry {
  id: string;
  team_code: string;
  full_name: string;
  sec: number | null;
}

function tokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-'’]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t !== "undefined" && t !== "null");
}

/**
 * « Blais Alex », « Scott Traversy-Essiambre », « Éliot Laverdière Boutin » :
 * mêmes mots dans un autre ordre, ou tous les mots du joueur présents dans le
 * nom de l'école. En cas d'homonymes, le niveau (sec. N) départage ; sinon on
 * ne devine pas.
 */
export function matchRoster(name: string, sec: number | null, roster: RosterEntry[]): RosterEntry | null {
  const t = tokens(name);
  const set = new Set(t);
  const key = [...t].sort().join(" ");
  let cands = roster.filter((r) => {
    const rt = tokens(r.full_name);
    return [...rt].sort().join(" ") === key || (rt.length >= 2 && rt.every((x) => set.has(x)));
  });
  if (cands.length > 1 && sec) {
    const bySec = cands.filter((r) => r.sec === sec);
    if (bySec.length > 0) cands = bySec;
  }
  return cands.length === 1 ? cands[0] : null;
}

/** « je convoque A (sec. 4), B (sec. 3) à une période » → [{ name, sec }]. */
export function extractConvokedWithSec(text: string): { name: string; sec: number | null }[] {
  const start = text.search(/convoque/i);
  if (start < 0) return [];
  const tail = text.slice(start + "convoque".length).replace(/\s+/g, " ");
  const end = tail.search(/\s+à une période/i);
  const list = end >= 0 ? tail.slice(0, end) : tail;
  return list
    .split(/,\s*/)
    .map((part) => {
      const m = part.match(/^(.*?)\s*(?:\(\s*sec\.?\s*(\d+)\s*\))?\s*$/i);
      const name = (m?.[1] ?? part).replace(/^(undefined|null)\s+/i, "").trim();
      return { name, sec: m?.[2] ? Number(m[2]) : null };
    })
    .filter((x) => x.name.length > 2);
}

/** « j'annule la convocation de Charles Bédard à une période étoilée le … » */
export function extractCancelledName(text: string): string | null {
  const m = text.replace(/\s+/g, " ").match(/annule la convocation de\s+(.+?)\s+à une période/i);
  return m ? m[1].replace(/^(undefined|null)\s+/i, "").trim() : null;
}

export function isStarCancellationEmail(subject: string): boolean {
  const s = subject.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return s.includes("annulation") && s.includes("periode etoilee");
}

/** « de 13:30 à 14:45 » → ["13:30", "14:45"]. */
export function extractTimes(text: string): { start: string | null; end: string | null } {
  const m = text.match(/de\s+(\d{1,2}:\d{2})\s+à\s+(\d{1,2}:\d{2})/i);
  return { start: m ? m[1].padStart(5, "0") : null, end: m ? m[2].padStart(5, "0") : null };
}

export interface BilanRow {
  jersey: number | null;
  name: string;
  past: number;
  upcoming: number;
  /** Moyenne générale de la 1re étape. */
  average: number | null;
  /** Matières sous 70 % à la 1re étape. */
  weak: { s: string; v: number }[];
}

export const SUBJECT_LABELS: Record<string, string> = {
  EDU: "Éduc. phys.", SCI: "Sciences", MAT: "Maths", HIS: "Histoire", GEO: "Géo", FRA: "Français", ANG: "Anglais",
  MUS: "Musique", CCQ: "Culture et citoyenneté", ARP: "Arts plastiques", CHI: "Chimie", PHY: "Physique",
  MON: "Monde contemporain", FIN: "Éduc. financière", SEC: "Option", PLA: "Arts plastiques", ENR: "Enrichissement",
};
const label = (s: string) => SUBJECT_LABELS[s] ?? s;

export function bilanText(teamName: string, coachFirst: string, rows: BilanRow[], withMeeting = true): string {
  const total = rows.reduce((s, r) => s + r.past, 0);
  return `Bonjour ${coachFirst},

Voici le bilan à jour des périodes étoilées de l'équipe ${teamName} depuis le 1er septembre : ${total} période${total > 1 ? "s" : ""} étoilée${total > 1 ? "s" : ""} à ce jour pour l'équipe. Le détail par joueur est ci-dessous (les convocations annulées par l'école ne sont pas comptées), avec les résultats de la 1re étape : la moyenne générale et les matières sous 70 %.${withMeeting ? "\n\nJe vais rencontrer avec toi, à l'école, les joueurs en difficulté." : ""}`;
}

export function bilanHtml(rows: BilanRow[]): string {
  const th = "padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #e5e7eb;";
  const td = "padding:8px 10px;border-bottom:1px solid #eef0f3;font-size:14px;";
  const body = rows
    .map((r, i) => {
      const color = r.past >= 6 ? "#b91c1c" : r.past >= 3 ? "#b45309" : "#1a1a1a";
      const weak = r.weak.length
        ? r.weak
            .map((g) => `<span style="display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:4px;font-size:12px;font-weight:bold;background:${g.v < 60 ? "#fee2e2" : "#fef3c7"};color:${g.v < 60 ? "#b91c1c" : "#92400e"};">${escapeHtml(label(g.s))} ${g.v}</span>`)
            .join("")
        : r.average == null
          ? `<span style="color:#9ca3af;">—</span>`
          : `<span style="color:#15803d;">Aucune</span>`;
      const avgColor = r.average != null && r.average < 70 ? "#b45309" : "#1a1a1a";
      return `<tr style="background:${i % 2 ? "#fafafa" : "#fff"};vertical-align:top;"><td style="${td}">${r.jersey ?? ""}</td><td style="${td}font-weight:bold;">${escapeHtml(r.name)}</td><td style="${td}text-align:center;font-weight:bold;color:${color};">${r.past}</td><td style="${td}text-align:center;">${r.upcoming || "—"}</td><td style="${td}text-align:center;font-weight:bold;color:${avgColor};">${r.average ?? "—"}</td><td style="${td}">${weak}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border:1px solid #e5e7eb;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
<tr><th style="${th}">#</th><th style="${th}">Joueur</th><th style="${th}text-align:center;">Étoilées à ce jour</th><th style="${th}text-align:center;">À venir</th><th style="${th}text-align:center;">Moy. 1re étape</th><th style="${th}">Matières sous 70 %</th></tr>
${body}
</table>`;
}

export function bilanPlain(rows: BilanRow[]): string {
  return rows
    .map((r) => `${r.jersey != null ? `#${r.jersey} ` : ""}${r.name} : ${r.past} étoilée(s)${r.upcoming ? ` (+${r.upcoming} à venir)` : ""} — moy. 1re étape : ${r.average ?? "—"}${r.weak.length ? ` — sous 70 % : ${r.weak.map((g) => `${label(g.s)} ${g.v}`).join(", ")}` : ""}`)
    .join("\n");
}
