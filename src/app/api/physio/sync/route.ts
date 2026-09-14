import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PHYSIO_CSV_URL, contentHash, isOurCategory, matchPlayerName, parsePhysioSheet } from "@/lib/physio";

/**
 * Synchronise les consultations depuis le Google Sheets de la clinique.
 *
 * La feuille est publique en lecture ; on la lit côté serveur pour éviter que
 * le navigateur bute sur les règles d'origine croisée de Google. Rien n'est
 * jamais écrit dans la feuille : la clinique en reste seule propriétaire.
 *
 * Une ligne modifiée par la clinique redevient « non lue » — c'est une nouvelle
 * information pour le coach, même si la date du rendez-vous n'a pas changé.
 */
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Configuration Supabase absente du serveur." }, { status: 500 });
  }
  const supabase = createClient(url, key);

  let rows;
  try {
    const res = await fetch(PHYSIO_CSV_URL, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Le Google Sheets n'est pas accessible. Vérifie qu'il reste partagé « toute personne ayant le lien »." },
        { status: 502 }
      );
    }
    // La feuille couvre tout le club : on ne garde que notre catégorie, sinon
    // chaque joueur M15 ou M13 serait signalé comme « introuvable ».
    rows = parsePhysioSheet(await res.text()).filter((r) => isOurCategory(r.category));
  } catch {
    return NextResponse.json({ error: "Lecture du Google Sheets impossible." }, { status: 502 });
  }

  const { data: players } = await supabase.from("players").select("id, full_name");

  const { data: existing } = await supabase
    .from("physio_consultations")
    .select("player_id, consult_date, content_hash");
  const known = new Map(
    (existing ?? []).map((e) => [`${e.player_id}|${e.consult_date}`, e.content_hash])
  );

  const unmatched: string[] = [];
  const changed: { player_id: string; consult_date: string }[] = [];
  const payload = [];

  for (const row of rows) {
    const match = matchPlayerName(row.name, players ?? []);
    if (!match) {
      unmatched.push(row.name);
      continue;
    }
    const playerId = match.id;
    const hash = contentHash(row);
    const key = `${playerId}|${row.consultDate}`;
    if (known.get(key) === hash) continue; // inchangée : on n'y touche pas

    changed.push({ player_id: playerId, consult_date: row.consultDate });
    payload.push({
      player_id: playerId,
      consult_date: row.consultDate,
      clinical_impression: row.clinicalImpression || null,
      intervention_plan: row.interventionPlan || null,
      state: row.state || null,
      clinical_followup: row.clinicalFollowup || null,
      recommendations: row.recommendations || null,
      review_in: row.reviewIn || null,
      appointment_type: row.appointmentType || null,
      content_hash: hash,
      seen_at: null,
      synced_at: new Date().toISOString(),
    });
  }

  if (payload.length > 0) {
    const { error } = await supabase
      .from("physio_consultations")
      .upsert(payload, { onConflict: "player_id,consult_date" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    read: rows.length,
    updated: changed.length,
    unmatched: [...new Set(unmatched)],
  });
}
