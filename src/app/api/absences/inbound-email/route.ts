import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { createServiceClient } from "@/lib/supabase/server";
import { matchPlayerName } from "@/lib/physio";
import {
  extractConvokedPlayerName,
  extractFrenchDate,
  isSchoolActivityAbsenceEmail,
  stripHtml,
} from "@/lib/schoolAbsenceEmail";

/**
 * Webhook Resend (event "email.received") pour l'adresse dédiée aux
 * confirmations d'école. Le webhook ne contient que les métadonnées — le
 * contenu (texte) est allé chercher séparément via l'API Resend.
 *
 * Volontairement étroit : seul le gabarit connu (« Absence à la période
 * d'activité du... », « je convoque <nom> (sec. N) ») déclenche une absence.
 * Tout le reste est ignoré sans qu'on tente de deviner — se tromper de
 * joueur ou de date dans son dossier serait pire que ne rien faire.
 */
export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (error) {
    // Filet de sécurité : sans ça, une exception imprévue renvoie une page
    // d'erreur Vercel générique sans corps — impossible à diagnostiquer
    // depuis le panneau "Response body" du webhook Resend.
    console.error("[absences/inbound-email] Erreur non gérée.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 }
    );
  }
}

async function handle(req: NextRequest) {
  const rawBody = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[absences/inbound-email] RESEND_WEBHOOK_SECRET manquant.");
    return NextResponse.json({ error: "Configuration manquante." }, { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "En-têtes de signature manquants." }, { status: 400 });
  }

  let event: { type: string; data: { email_id: string; subject: string } };
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as unknown as typeof event;
  } catch {
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, skipped: "event_type" });
  }

  const subject = event.data.subject ?? "";
  if (!isSchoolActivityAbsenceEmail(subject)) {
    return NextResponse.json({ ok: true, skipped: "subject" });
  }

  const emailRes = await fetch(`https://api.resend.com/emails/receiving/${event.data.email_id}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!emailRes.ok) {
    console.error("[absences/inbound-email] Échec de récupération du courriel", await emailRes.text());
    return NextResponse.json({ error: "Courriel introuvable chez Resend." }, { status: 502 });
  }
  const email = (await emailRes.json()) as { text: string | null; html: string | null };
  const body = email.text || (email.html ? stripHtml(email.html) : "");

  const playerName = extractConvokedPlayerName(body);
  const date = extractFrenchDate(subject) ?? extractFrenchDate(body);
  if (!playerName || !date) {
    console.error("[absences/inbound-email] Nom ou date introuvable dans le gabarit attendu.", { subject });
    return NextResponse.json({ ok: true, skipped: "gabarit_non_reconnu" });
  }

  const service = createServiceClient();
  const { data: players } = await service.from("players").select("id, full_name").eq("active", true);
  const match = matchPlayerName(playerName, players ?? []);
  if (!match) {
    console.error("[absences/inbound-email] Joueur non reconnu dans l'effectif.", { playerName });
    return NextResponse.json({ ok: true, skipped: "joueur_non_reconnu" });
  }

  const { data: existing } = await service
    .from("absences")
    .select("id")
    .eq("player_id", match.id)
    .eq("absence_date", date)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, skipped: "deja_enregistree" });
  }

  const { error } = await service.from("absences").insert({
    player_id: match.id,
    absence_date: date,
    reason: "ecole",
  });
  if (error) {
    console.error("[absences/inbound-email] Échec de l'insertion.", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, player_id: match.id, absence_date: date });
}
