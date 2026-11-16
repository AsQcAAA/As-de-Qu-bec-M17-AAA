import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { buildOnePagerData } from "@/lib/prescoutOnePager";
import { buildPrescoutPdf } from "@/lib/prescoutPdf";

/**
 * Envoi automatique du one pager de pre-scout, la veille de chaque match
 * (Vercel Cron, voir vercel.json). Destinataires : tous les coachs de l'app
 * (coach_profiles). L'objet du courriel et le nom du PDF sont identiques.
 *
 * Essai : /api/prescout/daily?game=<id>&to=<courriel> envoie le one pager
 * d'un match à une seule adresse. Protégé par CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY || !process.env.COACH_EMAIL) {
    return NextResponse.json({ error: "RESEND_API_KEY ou COACH_EMAIL manquant." }, { status: 500 });
  }
  const supabase = createServiceClient();
  const params = new URL(req.url).searchParams;

  let gameIds: string[];
  let recipients: string[];
  if (params.get("game")) {
    gameIds = [params.get("game")!];
    recipients = [params.get("to") || process.env.COACH_EMAIL];
  } else {
    // « Demain » à l'heure du Québec.
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Toronto" });
    const { data: games } = await supabase.from("games").select("id").eq("game_date", tomorrow);
    gameIds = (games ?? []).map((g) => g.id as string);
    const { data: coaches } = await supabase.from("coach_profiles").select("id");
    const ids = (coaches ?? []).map((c) => c.id as string);
    const emails: string[] = [];
    for (const id of ids) {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data.user?.email) emails.push(data.user.email);
    }
    recipients = emails.length ? emails : [process.env.COACH_EMAIL];
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sent: string[] = [];
  const skipped: string[] = [];
  for (const id of gameIds) {
    const d = await buildOnePagerData(supabase, id);
    // Adversaire inconnu de l'app (aucune page pre-scout) : rien à envoyer.
    if (!d) {
      skipped.push(id);
      continue;
    }
    const pdf = await buildPrescoutPdf(d);
    const intro = `Voici le pre-scout des ${d.team.name} pour le match de demain (${d.when.toLowerCase()}, ${d.where}).`;
    const { error } = await resend.emails.send({
      from: `Pre-scout As de Québec <${process.env.COACH_EMAIL}>`,
      to: recipients,
      subject: d.title,
      text: `Bonjour,\n\n${intro}\n\nLe one pager est en pièce jointe.`,
      html: `<p>Bonjour,</p><p>${intro}</p><p>Le one pager est en pièce jointe.</p>`,
      attachments: [{ filename: `${d.title}.pdf`, content: Buffer.from(pdf) }],
    });
    if (error) return NextResponse.json({ error: error.message, sent }, { status: 502 });
    sent.push(d.title);
  }
  return NextResponse.json({ sent, skipped, recipients: recipients.length });
}
