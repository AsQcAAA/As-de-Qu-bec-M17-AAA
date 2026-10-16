import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { EMAIL_SIGNATURE_BASE64, EMAIL_SIGNATURE_CID } from "@/lib/emailSignature";
import { buildEmailHtml, buildEmailText } from "@/lib/emailTemplate";
import { computeFiche, ficheHtml, type TestResultLike } from "@/lib/testsFiche";

export const maxDuration = 60;
const SPACING_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envoie à chaque joueur choisi (à sa famille) la fiche de ses tests physiques :
 * résultats, classement dans l'équipe et évolution depuis la séance précédente.
 * Un courriel par joueur, avec la signature de Jean, réservé à l'entraîneur-chef.
 * La fiche est recalculée ici à partir de la base.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const { data: profile } = await supabase.from("coach_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "head_coach") return NextResponse.json({ error: "Seul l'entraîneur-chef peut envoyer des courriels." }, { status: 403 });
  const coachEmail = process.env.COACH_EMAIL;
  if (!process.env.RESEND_API_KEY || !coachEmail) return NextResponse.json({ error: "RESEND_API_KEY ou COACH_EMAIL manquant côté serveur." }, { status: 500 });

  const body = (await req.json()) as { playerIds?: string[]; sessionDate?: string; subject?: string; message?: string; copyToMe?: boolean; testOnly?: boolean };
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const sessionDate = body.sessionDate ?? "";
  const playerIds = [...new Set(body.playerIds ?? [])];
  if (!subject || !message || !sessionDate) return NextResponse.json({ error: "Objet, message et séance requis." }, { status: 400 });
  if (playerIds.length === 0) return NextResponse.json({ error: "Aucun joueur choisi." }, { status: 400 });

  const service = createServiceClient();
  const [{ data: players }, { data: contacts }, { data: results }] = await Promise.all([
    service.from("players").select("id, full_name, active, is_call_up").eq("active", true).eq("is_call_up", false),
    service.from("player_contacts").select("player_id, emails").in("player_id", playerIds),
    service.from("player_test_results").select("player_id, test_name, value, unit, higher_is_better, test_date").limit(20000),
  ]);
  const roster = new Set((players ?? []).map((p) => p.id as string));
  const all = (results ?? []) as TestResultLike[];
  const emailsById = new Map((contacts ?? []).map((c) => [c.player_id as string, (c.emails ?? []) as string[]]));

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `Jean Grignon-Francke <${coachEmail}>`;
  const attachments = [{ filename: "signature.jpg", content: EMAIL_SIGNATURE_BASE64, contentId: EMAIL_SIGNATURE_CID }];

  async function sendOne(to: string[], msg: string, extraHtml: string, subj: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await resend.emails.send({ from, to, replyTo: coachEmail!, subject: subj, html: buildEmailHtml(msg, extraHtml), text: buildEmailText(msg), attachments });
      if (!error) return null;
      if (error.name === "rate_limit_exceeded") {
        await sleep(1200);
        continue;
      }
      return error.message;
    }
    return "Limite d'envoi de Resend atteinte, réessaie dans un instant.";
  }

  const targets = (players ?? []).filter((p) => playerIds.includes(p.id as string));
  const sent: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const failed: { name: string; error: string }[] = [];

  // Essai : la fiche du premier joueur choisi, à Jean seulement.
  if (body.testOnly) {
    const p = targets[0];
    if (!p) return NextResponse.json({ error: "Joueur introuvable." }, { status: 400 });
    const fiche = computeFiche(p.id as string, sessionDate, all, roster);
    if (fiche.rows.length === 0) return NextResponse.json({ error: "Aucun résultat pour ce joueur à cette séance." }, { status: 400 });
    const first = (p.full_name as string).trim().split(/\s+/)[0];
    const err = await sendOne([coachEmail], message.replaceAll("{joueur}", first), ficheHtml(p.full_name as string, fiche), `[TEST] ${subject.replaceAll("{joueur}", first)}`);
    if (err) return NextResponse.json({ ok: false, sent: [], skipped: [], failed: [{ name: "Essai", error: err }] });
    return NextResponse.json({ ok: true, sent: [`Toi (essai — fiche de ${p.full_name})`], skipped: [], failed: [] });
  }

  for (const p of targets) {
    const fiche = computeFiche(p.id as string, sessionDate, all, roster);
    const to = emailsById.get(p.id as string) ?? [];
    if (fiche.rows.length === 0) {
      skipped.push({ name: p.full_name as string, reason: "Aucun résultat à cette séance" });
      continue;
    }
    if (to.length === 0) {
      skipped.push({ name: p.full_name as string, reason: "Aucun courriel enregistré" });
      continue;
    }
    const first = (p.full_name as string).trim().split(/\s+/)[0];
    const err = await sendOne(to, message.replaceAll("{joueur}", first), ficheHtml(p.full_name as string, fiche), subject.replaceAll("{joueur}", first));
    if (err) failed.push({ name: p.full_name as string, error: err });
    else sent.push(`${p.full_name} (${to.join(", ")})`);
    await sleep(SPACING_MS);
  }
  if (body.copyToMe && sent.length > 0) {
    await sendOne([coachEmail], `${message.replaceAll("{joueur}", "[prénom]")}\n\n— Copie d'envoi —\nEnvoyé à ${sent.length} joueur(s) : ${sent.join(", ")}.`, "", `[Copie] ${subject.replaceAll("{joueur}", "[prénom]")}`);
  }
  return NextResponse.json({ ok: failed.length === 0, sent, skipped, failed });
}
