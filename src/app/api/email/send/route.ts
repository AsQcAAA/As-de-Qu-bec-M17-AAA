import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { EMAIL_SIGNATURE_BASE64, EMAIL_SIGNATURE_CID } from "@/lib/emailSignature";
import { buildEmailHtml, buildEmailText } from "@/lib/emailTemplate";

// Un envoi à toute l'équipe fait une trentaine d'appels espacés (limite de
// Resend : 2 requêtes par seconde) — plus que le délai par défaut d'une fonction.
export const maxDuration = 60;

const MAX_RECIPIENTS = 60;
const SPACING_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envoie un courriel personnalisé aux familles des joueurs choisis : un envoi
 * PAR joueur (une famille ne voit jamais les adresses d'une autre), toujours
 * avec la signature de Jean, et avec ses réponses redirigées vers son courriel
 * professionnel. Réservé à l'entraîneur-chef — l'app écrit en son nom.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const { data: profile } = await supabase.from("coach_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "head_coach") {
    return NextResponse.json({ error: "Seul l'entraîneur-chef peut envoyer des courriels." }, { status: 403 });
  }

  const coachEmail = process.env.COACH_EMAIL;
  if (!process.env.RESEND_API_KEY || !coachEmail) {
    return NextResponse.json({ error: "RESEND_API_KEY ou COACH_EMAIL manquant côté serveur." }, { status: 500 });
  }

  const body = (await req.json()) as {
    playerIds?: string[];
    subject?: string;
    message?: string;
    extraHtml?: string;
    copyToMe?: boolean;
    onlyEmails?: string[];
  };
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const playerIds = [...new Set(body.playerIds ?? [])];
  if (!subject || !message) return NextResponse.json({ error: "Objet et message requis." }, { status: 400 });
  if (playerIds.length === 0) return NextResponse.json({ error: "Aucun destinataire." }, { status: 400 });
  if (playerIds.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Maximum ${MAX_RECIPIENTS} destinataires par envoi.` }, { status: 400 });
  }

  const service = createServiceClient();
  const [{ data: players }, { data: contacts }] = await Promise.all([
    service.from("players").select("id, full_name").in("id", playerIds),
    service.from("player_contacts").select("player_id, emails").in("player_id", playerIds),
  ]);
  const emailsById = new Map((contacts ?? []).map((c) => [c.player_id as string, (c.emails ?? []) as string[]]));

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `Jean Grignon-Francke <${coachEmail}>`;
  const attachments = [{ filename: "signature.jpg", content: EMAIL_SIGNATURE_BASE64, contentId: EMAIL_SIGNATURE_CID }];

  async function sendOne(to: string[], personalizedMessage: string, subjectLine: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await resend.emails.send({
        from,
        to,
        replyTo: coachEmail!,
        subject: subjectLine,
        html: buildEmailHtml(personalizedMessage, body.extraHtml),
        text: buildEmailText(personalizedMessage),
        attachments,
      });
      if (!error) return null;
      if (error.name === "rate_limit_exceeded") {
        await sleep(1200);
        continue;
      }
      return error.message;
    }
    return "Limite d'envoi de Resend atteinte, réessaie dans un instant.";
  }

  const sent: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const player of players ?? []) {
    const all = emailsById.get(player.id) ?? [];
    // Adresse choisie précisément (ex. un clic sur un courriel d'une fiche) : on ne garde que celle-là.
    const to = body.onlyEmails && playerIds.length === 1 ? all.filter((e) => body.onlyEmails!.includes(e)) : all;
    if (to.length === 0) {
      skipped.push({ name: player.full_name, reason: "Aucun courriel enregistré" });
      continue;
    }
    const firstName = player.full_name.trim().split(/\s+/)[0];
    const personalized = message.replaceAll("{joueur}", firstName);
    const err = await sendOne(to, personalized, subject.replaceAll("{joueur}", firstName));
    if (err) failed.push({ name: player.full_name, error: err });
    else sent.push(player.full_name);
    await sleep(SPACING_MS);
  }

  // Une seule copie récapitulative pour Jean (pas une par famille).
  if (body.copyToMe && sent.length > 0) {
    const recap = `${message.replaceAll("{joueur}", "[prénom du joueur]")}\n\n— Copie d'envoi —\nEnvoyé à ${sent.length} famille(s) : ${sent.join(", ")}.`;
    await sendOne([coachEmail], recap, `[Copie] ${subject.replaceAll("{joueur}", "[prénom du joueur]")}`);
  }

  return NextResponse.json({ ok: failed.length === 0, sent, skipped, failed });
}
