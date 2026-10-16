// Lecture des fichiers Excel de la Direction générale (budget 2026-27 par équipe,
// distribution monétaire). Les fichiers sont privés sur le Drive : on les lit
// ici à partir d'un classeur Excel téléversé, puis le contenu structuré est
// enregistré dans dg_documents (JSON) — lisible par l'entraîneur-chef seulement.

import type ExcelJS from "exceljs";

// ---------------------------------------------------------------- utilitaires

export function normText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cell(row: ExcelJS.Row, col: number): unknown {
  const v = row.getCell(col).value as unknown;
  if (v && typeof v === "object") {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
    if (o.result !== undefined) return o.result;
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return o.text;
    return null; // formule sans résultat enregistré
  }
  return v ?? null;
}
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

// -------------------------------------------------------------------- budget

export interface BudgetLine {
  /** « Revenus » ou « Dépenses ». */
  group: string;
  /** Section (Activités hockey, Équipement, Honoraires et salaires…). */
  section: string | null;
  label: string;
  nombre: number | null;
  montant: number | null;
  reel: number | null;
  projection: number | null;
  prev: number | null;
  note: string | null;
  /** Total de section, total général ou résultat — jamais additionné avec les postes. */
  isTotal: boolean;
}

export interface BudgetSheet {
  team: string;
  title: string;
  /** Titres de colonnes lus dans le fichier (Nombre, Montant, Réel, Projection, année précédente). */
  headers: string[];
  lines: BudgetLine[];
}

const SECTION_STARTS = [
  "activites hockey",
  "activites hockey paye",
  "equipement",
  "hororaires et salaires",
  "honoraires et salaires",
  "honoraires externes",
  "frais administratifs",
];

export function parseBudgetWorkbook(wb: ExcelJS.Workbook): BudgetSheet[] {
  const out: BudgetSheet[] = [];
  for (const ws of wb.worksheets) {
    // La ligne d'en-tête est celle dont la colonne B s'intitule « Nombre ».
    let headerRow = -1;
    ws.eachRow((row, n) => {
      if (headerRow === -1 && normText(str(cell(row, 2))) === "nombre") headerRow = n;
    });
    if (headerRow === -1) continue;
    const headers = [2, 3, 4, 5, 6].map((c) => str(cell(ws.getRow(headerRow), c)));
    const title = str(cell(ws.getRow(3), 1)) || ws.name;

    const lines: BudgetLine[] = [];
    let group = "Revenus";
    let section: string | null = null;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n <= headerRow) return;
      const label = str(cell(row, 1));
      if (!label) return;
      const nombre = num(cell(row, 2));
      const montant = num(cell(row, 3));
      const reel = num(cell(row, 4));
      const projection = num(cell(row, 5));
      const prev = num(cell(row, 6));
      const note = str(cell(row, 7)) || null;
      const key = normText(label);
      const noNumbers = [nombre, montant, reel, projection, prev].every((x) => x === null);

      if (key === "revenus") {
        group = "Revenus";
        section = null;
        return;
      }
      if (key.startsWith("depenses")) {
        group = "Dépenses";
        section = null;
        return;
      }
      if (noNumbers && SECTION_STARTS.some((s) => key.startsWith(s))) {
        section = label;
        return;
      }
      const isTotal = key.startsWith("total") || key === "resultat";
      // Une ligne sans aucun montant et qui n'est pas une section : poste non budgété, on la garde à zéro.
      lines.push({ group, section: isTotal ? null : section, label, nombre, montant, reel, projection, prev, note, isTotal });
      if (key.startsWith("honoraires externes")) section = label;
    });
    out.push({ team: ws.name, title, headers, lines });
  }
  return out;
}

// ----------------------------------------------------------------- distribution

export interface DistTask {
  label: string;
  montant: number | null;
  das: number | null;
  total: number | null;
  /** Lignes descriptives sous la tâche (sans montant). */
  details: string[];
}

export interface DistPerson {
  name: string;
  group: string;
  status: string | null;
  tasks: DistTask[];
  /** Lignes descriptives avant la première tâche (ex. « Hockey »). */
  notes: string[];
  /** Total inscrit dans le fichier pour cette personne. */
  sheetTotal: { montant: number | null; das: number | null; total: number | null } | null;
}

export interface DistSummaryLine {
  label: string;
  montant: number | null;
  das: number | null;
  total: number | null;
  note: string | null;
}

export interface DistDocument {
  sheetName: string;
  people: DistPerson[];
  summary: DistSummaryLine[];
}

const STATUS_RE = /^(contrat|courriel|en attente|x$)/i;

/** Lit la PREMIÈRE feuille du fichier de distribution monétaire. */
export function parseDistributionWorkbook(wb: ExcelJS.Workbook): DistDocument {
  const ws = wb.worksheets[0];
  const people: DistPerson[] = [];
  const summary: DistSummaryLine[] = [];
  let group = "Temps plein";
  let current: DistPerson | null = null;
  let inSummary = false;

  ws.eachRow({ includeEmpty: false }, (row) => {
    const A = str(cell(row, 1));
    const B = str(cell(row, 2));
    const C = str(cell(row, 3));
    const Dn = num(cell(row, 4));
    const Dtxt = str(cell(row, 4));
    const En = num(cell(row, 5));
    const Fn = num(cell(row, 6));
    const G = str(cell(row, 7)) || null;

    if (/^temps /i.test(A)) {
      group = /partiel/i.test(A) ? "Temps partiel" : "Temps plein";
      return;
    }
    if (normText(A) === "prenom") return;
    if (/^total avant remboursement|^total apres remboursement/i.test(normText(Dtxt))) {
      inSummary = true;
      summary.push({ label: Dtxt.replace(/\s+/g, " "), montant: null, das: null, total: null, note: null });
      return;
    }
    if (inSummary) {
      if (C && (Dn !== null || Fn !== null)) summary.push({ label: C, montant: Dn, das: En, total: Fn, note: G });
      return;
    }

    if (A) {
      if (STATUS_RE.test(A)) {
        if (current) current.status = A;
      } else {
        current = { name: `${A} ${B}`.replace(/\s+/g, " ").trim(), group, status: null, tasks: [], notes: [], sheetTotal: null };
        people.push(current);
      }
    }
    if (!current) return;

    if (C && Dn !== null) {
      current.tasks.push({ label: C, montant: Dn, das: En, total: Fn, details: [] });
    } else if (C) {
      const last = current.tasks[current.tasks.length - 1];
      if (last) last.details.push(C);
      else current.notes.push(C);
    } else if (Dn !== null) {
      current.sheetTotal = { montant: Dn, das: En, total: Fn };
    }
  });
  return { sheetName: ws.name, people: people.filter((p) => p.tasks.length > 0 || p.sheetTotal), summary };
}

// ------------------------------------------------------------------ affichage

export const money = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
