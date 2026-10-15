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

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  /** Séances de tests, de la plus ancienne à la plus récente. */
  const sessionDates = useMemo(() => [...new Set(results.map((r) => r.test_date))].sort(), [results]);

  /**
   * Titre d'une séance : la saison plutôt que la date exacte (A25 = automne
   * 2025, H26 = hiver 2026, É26 = été 2026). Si deux séances tombent dans la
   * même saison, on retombe sur la date pour les distinguer.
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

  // Séance affichée : la plus récente tant qu'on n'en choisit pas une autre.
  const [pickedSession, setPickedSession] = useState<string | null>(null);
  const session = pickedSession && sessionDates.includes(pickedSession) ? pickedSession : sessionDates[sessionDates.length - 1] ?? "";
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: "__name", desc: false });

  /** Tests de la séance, dans un ordre stable (les tests habituels d'abord). */
  const testColumnsOfSession = useMemo(() => {
    const order = ["Pallier 30-15", "Saut horizontal", "Lancer de ballon", "Chin up", "Bench press @ 75% BW", "Agilité 5-10-5 R", "Agilité 5-10-5 L", "Sprint 30 m (1)", "Sprint 30 m (2)", "Grandeur assise"];
    const names = [...new Set(results.filter((r) => r.test_date === session).map((r) => r.test_name))];
    return names.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [results, session]);

  /** Une ligne par joueur ayant au moins un résultat à cette séance. */
  const matrix = useMemo(() => {
    const byPlayer = new Map<string, Map<string, PlayerTestResult>>();
    for (const r of results) {
      if (r.test_date !== session) continue;
      if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, new Map());
      byPlayer.get(r.player_id)!.set(r.test_name, r);
    }
    const rows = [...byPlayer.entries()]
      .map(([playerId, tests]) => ({ player: nameById.get(playerId), playerId, tests }))
      .filter((r) => r.player);

    // Couleur par colonne : du pire (rouge) au meilleur (vert), selon le sens du test.
    const scale = new Map<string, { min: number; max: number; higher: boolean; unit: string | null }>();
    for (const name of testColumnsOfSession) {
      const vals = rows.map((r) => r.tests.get(name)).filter((x): x is PlayerTestResult => !!x);
      if (vals.length === 0) continue;
      scale.set(name, {
        min: Math.min(...vals.map((v) => v.value)),
        max: Math.max(...vals.map((v) => v.value)),
        higher: vals[0].higher_is_better,
        unit: vals[0].unit,
      });
    }

    const valueOf = (r: (typeof rows)[number]) =>
      sort.key === "__name" ? null : r.tests.get(sort.key)?.value ?? null;
    rows.sort((a, b) => {
      if (sort.key === "__name") {
        const cmp = lastName(a.player!.full_name).localeCompare(lastName(b.player!.full_name));
        return sort.desc ? -cmp : cmp;
      }
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // sans résultat : toujours en bas
      if (vb === null) return -1;
      return sort.desc ? vb - va : va - vb;
    });
    return { rows, scale };
  }, [results, session, nameById, testColumnsOfSession, sort]);

  function toggleSort(key: string) {
    setSort((cur) => (cur.key === key ? { key, desc: !cur.desc } : { key, desc: key !== "__name" }));
  }

  /** Fond d'une cellule : vert = meilleur, rouge = pire ; plus c'est extrême, plus c'est soutenu. */
  function cellColor(testName: string, value: number): { bg: string; extreme: "best" | "worst" | null } {
    const sc = matrix.scale.get(testName);
    if (!sc || sc.max === sc.min) return { bg: "transparent", extreme: null };
    let t = (value - sc.min) / (sc.max - sc.min); // 0 = plus bas, 1 = plus haut
    if (!sc.higher) t = 1 - t; // pour un temps, plus bas = meilleur
    const distance = Math.abs(t - 0.5) * 2; // 0 au milieu, 1 aux extrêmes
    const lightness = 95 - 27 * distance;
    return {
      bg: `hsl(${Math.round(t * 120)}, 72%, ${Math.round(lightness)}%)`,
      extreme: t >= 0.999 ? "best" : t <= 0.001 ? "worst" : null,
    };
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
      ) : sessionDates.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun test enregistré pour l'instant. Importe un fichier Excel ci-dessus, ou ajoute des résultats depuis une fiche joueur.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-semibold text-white">Séance de tests</label>
            <select className="input w-auto" value={session} onChange={(e) => setPickedSession(e.target.value)}>
              {[...sessionDates].reverse().map((d) => (
                <option key={d} value={d}>
                  {sessionLabels.get(d)} — {d}
                </option>
              ))}
            </select>
            <span className="inline-flex items-center gap-2 text-xs text-slate-300">
              <span className="rounded px-2 py-0.5 font-bold" style={{ background: "hsl(120, 72%, 68%)", color: "#111" }}>
                meilleur
              </span>
              <span className="rounded px-2 py-0.5 font-bold" style={{ background: "hsl(0, 72%, 68%)", color: "#111" }}>
                pire
              </span>
              <span className="text-slate-400">par colonne — clique un titre pour trier</span>
            </span>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-slate-500">
                  <th
                    className="sticky left-0 bg-white py-2 pr-4 cursor-pointer select-none border-b"
                    onClick={() => toggleSort("__name")}
                  >
                    Joueur {sort.key === "__name" ? (sort.desc ? "▼" : "▲") : ""}
                  </th>
                  {testColumnsOfSession.map((name) => (
                    <th
                      key={name}
                      className="py-2 px-3 cursor-pointer select-none whitespace-nowrap border-b text-center hover:text-ink-900"
                      onClick={() => toggleSort(name)}
                      title={matrix.scale.get(name)?.higher === false ? "Moins = mieux" : "Plus = mieux"}
                    >
                      {name}
                      {matrix.scale.get(name)?.unit ? <span className="font-normal text-slate-400"> ({matrix.scale.get(name)!.unit})</span> : null}{" "}
                      {sort.key === name ? (sort.desc ? "▼" : "▲") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.playerId}>
                    <td className="sticky left-0 bg-white py-1.5 pr-4 border-b whitespace-nowrap">
                      <Link href={`/joueurs/${row.playerId}`} className="hover:text-gold-700 hover:underline">
                        {row.player?.jersey_number ? `#${row.player.jersey_number} ` : ""}
                        {row.player?.full_name}
                      </Link>
                    </td>
                    {testColumnsOfSession.map((name) => {
                      const r = row.tests.get(name);
                      if (!r) {
                        return (
                          <td key={name} className="py-1.5 px-3 text-center text-slate-300 border-b">
                            –
                          </td>
                        );
                      }
                      const { bg, extreme } = cellColor(name, r.value);
                      return (
                        <td
                          key={name}
                          className={`py-1.5 px-3 text-center border-b tabular-nums ${extreme ? "font-black text-ink-900" : "font-medium"}`}
                          style={{ background: bg }}
                          title={extreme === "best" ? "Meilleur résultat" : extreme === "worst" ? "Moins bon résultat" : undefined}
                        >
                          {r.value}
                          {r.notes === INJURED_NOTE && (
                            <span title={INJURED_NOTE} className="ml-1">
                              🩹
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {results.some((r) => r.test_date === session && r.notes === INJURED_NOTE) && (
              <p className="text-xs text-slate-500 pt-2">🩹 Blessé lors du test</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
