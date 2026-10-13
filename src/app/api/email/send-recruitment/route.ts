import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_SIGNATURE_BASE64, EMAIL_SIGNATURE_CID } from "@/lib/emailSignature";
import { buildEmailHtml, buildEmailText } from "@/lib/emailTemplate";

export const maxDuration = 60;

const MAX_RECIPIENTS = 10;
const MAX_ATTACHMENTS = 30;
const MAX_TOTAL_BASE64 = 20 * 1024 * 1024;
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/**
 * Envoie une ou plusieurs fiches de recrutement (PDF générés par le navigateur)
 * à des adresses externes saisies à la main : un recruteur, jamais une famille.
 * Un seul courriel, avec la signature de Jean, ses réponses redirigées vers son
 * courriel professionnel. Réservé à l'entraîneur-chef.
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
    to?: string[];
    subject?: string;
    message?: string;
    copyToMe?: boolean;
    testOnly?: boolean;
    attachments?: { filename?: string; contentBase64?: string }[];
  };
  const subject = (body.subject ?? "").trim();
  const message = (body.message ?? "").trim();
  const to = [...new Set((body.to ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const files = (body.attachments ?? []).filter((a) => a.filename && a.contentBase64);

  if (!subject || !message) return NextResponse.json({ error: "Objet et message requis." }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "Aucune fiche à joindre." }, { status: 400 });
  if (files.length > MAX_ATTACHMENTS) return NextResponse.json({ error: `Maximum ${MAX_ATTACHMENTS} fiches par envoi.` }, { status: 400 });
  if (files.reduce((n, a) => n + a.contentBase64!.length, 0) > MAX_TOTAL_BASE64) {
    return NextResponse.json({ error: "Pièces jointes trop volumineuses." }, { status: 400 });
  }
  if (!body.testOnly) {
    if (to.length === 0) return NextResponse.json({ error: "Aucun destinataire." }, { status: 400 });
    if (to.length > MAX_RECIPIENTS) return NextResponse.json({ error: `Maximum ${MAX_RECIPIENTS} destinataires.` }, { status: 400 });
    const bad = to.filter((e) => !EMAIL_RE.test(e));
    if (bad.length > 0) return NextResponse.json({ error: `Adresse invalide : ${bad.join(", ")}` }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const attachments = [
    { filename: "signature.jpg", content: EMAIL_SIGNATURE_BASE64, contentId: EMAIL_SIGNATURE_CID },
    ...files.map((a) => ({ filename: a.filename!.replace(/[\\/:*?"<>|]/g, "-"), content: a.contentBase64! })),
  ];

  const { error } = await resend.emails.send({
    from: `Jean Grignon-Francke <${coachEmail}>`,
    to: body.testOnly ? [coachEmail] : to,
    bcc: !body.testOnly && body.copyToMe ? [coachEmail] : undefined,
    replyTo: coachEmail,
    subject: body.testOnly ? `[TEST] ${subject}` : subject,
    html: buildEmailHtml(message),
    text: buildEmailText(message),
    attachments,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, sentTo: body.testOnly ? ["Toi (essai)"] : to, attachments: files.length });
}
