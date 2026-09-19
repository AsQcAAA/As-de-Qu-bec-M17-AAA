"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { lastName } from "@/lib/players";
import type { Player, PlayerTestResult } from "@/lib/types";

interface ParsedRow {
  raw: string;
  playerId: string | null;
  values: Record<string, number>;
}

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchPlayer(raw: string, players: Player[]): Player | null {
  const n = normalize(raw);
  if (!n) return null;
  // Numéro de chandail exact.
  const asNumber = Number(raw);
  if (!Number.isNaN(asNumber)) {
    const byNumber = players.find((p) => p.jersey_number === asNumber);
    if (byNumber) return byNumber;
  }
  // Nom de famille exact, puis nom complet contenu dans la cellule.
  const byLastName = players.find((p) => normalize(lastName(p.full_name)) === n);
  if (byLastName) return byLastName;
  const byFullName = players.find((p) => n.includes(normalize(p.full_name)) || normalize(p.full_name).includes(n));
  return byFullName ?? null;
}

/** Note marquant un résultat obtenu par un joueur blessé — affiché par un emoji dans le tableau. */
const INJURED_NOTE = "Blessé lors du test";

export default function TestsPhysiquesPage() {
  const supabase = createClient();
  const [players, setPlayers] = useState<Player[]>([]);
  const [results, setResults] = useState<PlayerTestResult[]>([]);
  const [selectedTest, setSelectedTest] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [testColumns, setTestColumns] = useState<string[]>([]);
  const [testConfig, setTestConfig] = useState<Record<string, { unit: string; higherIsBetter: boolean }>>({});
  const [testDate, setTestDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [importSaving, setImportSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [{ data: pls }, { data: res }] = await Promise.all([
      supabase.from("players").select("*").eq("is_call_up", false),
      supabase.from("player_test_results").select("*").order("test_date", { ascending: false }),
    ]);
    setPlayers(pls ?? []);
    setResults(res ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const testNames = useMemo(() => [...new Set(results.map((r) => r.test_name))].sort(), [results]);

  useEffect(() => {
    if (!selectedTest && testNames.length > 0) setSelectedTest(testNames[0]);
  }, [testNames, selectedTest]);

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const ranking = useMemo(() => {
    if (!selectedTest) return [];
    const latestByPlayer = new Map<string, PlayerTestResult>();
    for (const r of results) {
      if (r.test_name !== selectedTest) continue;
      const existing = latestByPlayer.get(r.player_id);
      if (!existing || r.test_date > existing.test_date) latestByPlayer.set(r.player_id, r);
    }
    const higherIsBetter = [...latestByPlayer.values()][0]?.higher_is_better ?? true;
    return [...latestByPlayer.values()].sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));
  }, [selectedTest, results]);

  /** Séances du test choisi, de la plus ancienne à la plus récente. */
  const sessionDates = useMemo(
    () => [...new Set(results.filter((r) => r.test_name === selectedTest).map((r) => r.test_date))].sort(),
    [selectedTest, results]
  );

  /**
   * Titre de colonne d'une séance : la saison plutôt que la date exacte
   * (A25 = automne 2025, H26 = hiver 2026, É26 = été 2026). Si deux séances
   * tombent dans la même saison, on retombe sur la date pour les distinguer.
   */
  const sessionLabels = useMemo(() => {
    const seasonOf = (date: string) => {
      const month = Number(date.slice(5, 7));
      const letter = month >= 8 ? "A" : month <= 4 ? "H" : "É";
      return `${letter}${date.slice(2, 4)}`;
    };
    const counts = new Map<string, number>();
    for (const d of sessionDates) counts.set(seasonOf(d), (counts.get(seasonOf(d)) ?? 0) + 1);
    return new Map(sessionDates.map((d) => [d, (counts.get(seasonOf(d)) ?? 0) > 1 ? d : seasonOf(d)]));
  }, [sessionDates]);

  /** Résultat d'un joueur à une date précise pour le test choisi. */
  const resultAt = useMemo(() => {
    const map = new Map<string, PlayerTestResult>();
    for (const r of results) if (r.test_name === selectedTest) map.set(`${r.player_id}|${r.test_date}`, r);
    return map;
  }, [selectedTest, results]);

  /** Note associée à une séance (ex. « Tests de l'automne 2025 »), pour l'infobulle de l'en-tête. */
  const noteByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of results) if (r.test_name === selectedTest && r.notes && r.notes !== INJURED_NOTE) map.set(r.test_date, r.notes);
    return map;
  }, [selectedTest, results]);

  /** Écart entre le résultat le plus récent d'un joueur et celui qui le précède. */
  function evolution(r: PlayerTestResult) {
    let previous: PlayerTestResult | null = null;
    for (const other of results) {
      if (other.test_name !== selectedTest || other.player_id !== r.player_id || other.test_date >= r.test_date) continue;
      if (!previous || other.test_date > previous.test_date) previous = other;
    }
    if (!previous) return null;
    const delta = Math.round((r.value - previous.value) * 100) / 100;
    const better = r.higher_is_better ? delta > 0 : delta < 0;
    return { delta, better };
  }

  async function handleFile(file: File) {
    setImporting(true);
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      setImporting(false);
      return;
    }

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = String(cell.value ?? "").trim();
    });
    const columns = headers.slice(2).filter(Boolean);
    setTestColumns(columns);
    setTestConfig(Object.fromEntries(columns.map((c) => [c, { unit: "", higherIsBetter: true }])));

    const rows: ParsedRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const raw = String(row.getCell(1).value ?? "").trim();
      if (!raw) return;
      const values: Record<string, number> = {};
      columns.forEach((col, i) => {
        const cell = row.getCell(i + 2);
        const v = Number(cell.value);
        if (!Number.isNaN(v) && cell.value !== null && cell.value !== "") values[col] = v;
      });
      const match = matchPlayer(raw, players);
      rows.push({ raw, playerId: match?.id ?? null, values });
    });
    setParsedRows(rows);
    setImporting(false);
  }

  async function confirmImport() {
    setImportSaving(true);
    const inserts: { player_id: string; test_name: string; value: number; unit: string | null; higher_is_better: boolean; test_date: string }[] = [];
    for (const row of parsedRows) {
      if (!row.playerId) continue;
      for (const [testName, value] of Object.entries(row.values)) {
        const cfg = testConfig[testName];
        inserts.push({
          player_id: row.playerId,
          test_name: testName,
          value,
          unit: cfg?.unit || null,
          higher_is_better: cfg?.higherIsBetter ?? true,
          test_date: testDate,
        });
      }
    }
    if (inserts.length > 0) await supabase.from("player_test_results").insert(inserts);
    setImportSaving(false);
    setParsedRows([]);
    setTestColumns([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    load();
  }

  function cancelImport() {
    setParsedRows([]);
    setTestColumns([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const matchedCount = parsedRows.filter((r) => r.playerId).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tests physiques</h1>
        <p className="text-slate-500 text-sm">Classement de l'équipe pour chaque test.</p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Importer un fichier Excel</h2>
        <p className="text-xs text-slate-500">
          Première colonne : nom ou numéro de joueur. Colonnes suivantes : un test par colonne (valeurs numériques).
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="text-sm"
        />
        {importing && <p className="text-sm text-slate-500">Lecture du fichier...</p>}

        {parsedRows.length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <label className="label mb-0">Date des tests</label>
              <input type="date" className="input w-auto" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              {testColumns.map((col) => (
                <div key={col} className="flex items-center gap-2 text-sm">
                  <span className="font-medium w-32 truncate">{col}</span>
                  <input
                    className="input w-20"
                    placeholder="Unité"
                    value={testConfig[col]?.unit ?? ""}
                    onChange={(e) => setTestConfig({ ...testConfig, [col]: { ...testConfig[col], unit: e.target.value } })}
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={testConfig[col]?.higherIsBetter ?? true}
                      onChange={(e) =>
                        setTestConfig({ ...testConfig, [col]: { ...testConfig[col], higherIsBetter: e.target.checked } })
                      }
                    />
                    Plus haut = meilleur
                  </label>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-1 pr-4">Cellule</th>
                    <th className="py-1 pr-4">Joueur détecté</th>
                    {testColumns.map((c) => (
                      <th key={c} className="py-1 pr-4">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-4">{row.raw}</td>
                      <td className="py-1 pr-4">
                        {row.playerId ? (
                          nameById.get(row.playerId)?.full_name
                        ) : (
                          <select
                            className="input text-xs w-40"
                            value=""
                            onChange={(e) => {
                              const pid = e.target.value;
                              setParsedRows(parsedRows.map((r, j) => (j === i ? { ...r, playerId: pid || null } : r)));
                            }}
                          >
                            <option value="">— Non reconnu, choisir —</option>
                            {players.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      {testColumns.map((c) => (
                        <td key={c} className="py-1 pr-4">
                          {row.values[c] ?? "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              {matchedCount}/{parsedRows.length} joueurs reconnus.
            </p>

            <div className="flex gap-2">
              <button className="btn" onClick={confirmImport} disabled={importSaving || matchedCount === 0}>
                {importSaving ? "Import..." : `Importer (${matchedCount})`}
              </button>
              <button className="btn-secondary" onClick={cancelImport}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : testNames.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun test enregistré pour l'instant. Importe un fichier Excel ci-dessus, ou ajoute des résultats depuis une fiche joueur.
        </p>
      ) : (
        <>
          <select className="input w-auto" value={selectedTest} onChange={(e) => setSelectedTest(e.target.value)}>
            {testNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Joueur</th>
                  {sessionDates.map((d) => (
                    <th key={d} className="py-2 pr-4" title={noteByDate.get(d)}>
                      {sessionLabels.get(d)}
                    </th>
                  ))}
                  {sessionDates.length > 1 && <th className="py-2 pr-4">Évolution</th>}
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => {
                  const evo = evolution(r);
                  const player = nameById.get(r.player_id);
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-bold text-ink-900">{i + 1}</td>
                      <td className="py-2 pr-4">
                        <Link href={`/joueurs/${r.player_id}`} className="hover:text-gold-700 hover:underline">
                          {player?.jersey_number ? `#${player.jersey_number} ` : ""}
                          {player?.full_name ?? "?"}
                        </Link>
                      </td>
                      {sessionDates.map((d) => {
                        const res = resultAt.get(`${r.player_id}|${d}`);
                        const isLatest = d === sessionDates[sessionDates.length - 1];
                        return (
                          <td key={d} className={`py-2 pr-4 ${isLatest ? "font-bold" : ""}`}>
                            {res ? `${res.value} ${res.unit ?? ""}` : "-"}
                            {res?.notes === INJURED_NOTE && (
                              <span title={INJURED_NOTE} className="ml-1">
                                🩹
                              </span>
                            )}
                          </td>
                        );
                      })}
                      {sessionDates.length > 1 && (
                        <td
                          className={`py-2 pr-4 font-medium ${
                            !evo || evo.delta === 0 ? "text-slate-400" : evo.better ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {evo ? `${evo.delta > 0 ? "+" : ""}${evo.delta}` : "-"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {results.some((r) => r.test_name === selectedTest && r.notes === INJURED_NOTE) && (
              <p className="text-xs text-slate-500 pt-2">🩹 Blessé lors du test</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
