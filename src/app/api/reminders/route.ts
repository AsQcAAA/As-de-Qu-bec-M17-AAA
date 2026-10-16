import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { computeMeetingStatuses } from "@/lib/meetings";
import { EMAIL_SIGNATURE_BASE64, EMAIL_SIGNATURE_CID } from "@/lib/emailSignature";
import { buildEmailHtml, buildEmailText } from "@/lib/emailTemplate";
import { computeFiche, ficheHtml, type TestResultLike } from "@/lib/testsFiche";
import { buildMissingLineupEmail, findMissingOpponentLineups } from "@/lib/opponentLineupReminder";
import type { Meeting, Player } from "@/lib/types";

// Called weekly by Vercel Cron (see vercel.json). Checks which active
// players have gone 3+ weeks without an individual meeting and emails the
// coach a summary. Protected by CRON_SECRET so it can't be triggered by
// random requests to a public URL.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const [{ data: players }, { data: meetings }] = await Promise.all([
    supabase.from("players").select("*").eq("active", true).eq("is_call_up", false),
    supabase.from("meetings").select("*"),
  ]);

  // Essai : /api/reminders?test=1&date=2026-10-12 envoie UNIQUEMENT à COACH_EMAIL
  // l'exemple du rappel d'alignement adverse, pour le lundi donné.
  const test = new URL(req.url).searchParams;
  if (test.get("test") === "1") {
    return NextResponse.json(await sendLineupReminderTest(supabase, new URL(req.url).origin, test.get("date")));
  }

  // Essai de la fiche des tests physiques : /api/reminders?testfiche=<nom>&session=<date>
  // — un seul courriel, à COACH_EMAIL.
  if (test.get("testfiche")) {
    return NextResponse.json(await sendTestsFicheTest(supabase, test.get("testfiche")!, test.get("session") ?? ""));
  }

  // Premier envoi : tous les matchs de saison régulière sans alignement adverse
  // saisi, depuis le début de la saison. /api/reminders?backlog=1
  if (test.get("backlog") === "1") {
    return NextResponse.json(await sendMissingLineupReminder(supabase, new URL(req.url).origin, "2026-09-01"));
  }

  const meetingResult = await sendOverdueMeetingsReminder(supabase, players, meetings);
  const lineupResult = await sendMissingLineupReminder(supabase, new URL(req.url).origin);
  return NextResponse.json({ ok: true, ...meetingResult, lineups: lineupResult });
}

async function sendOverdueMeetingsReminder(
  supabase: ReturnType<typeof createServiceClient>,
  players: unknown,
  meetings: unknown
) {
  const statuses = computeMeetingStatuses((players ?? []) as Player[], (meetings ?? []) as Meeting[]);
  const overdue = statuses.filter((s) => s.overdue);

  if (overdue.length === 0) {
    return { overdueCount: 0, emailSent: false };
  }

  if (!process.env.RESEND_API_KEY || !process.env.COACH_EMAIL) {
    return { overdueCount: overdue.length, emailSent: false, reason: "RESEND_API_KEY or COACH_EMAIL missing" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const listHtml = overdue
    .map(
      (s) =>
        `<li><strong>${s.player.full_name}</strong> — ${
          s.daysSince === null ? "aucune rencontre enregistrée" : `${s.daysSince} jours depuis la dernière rencontre`
        }</li>`
    )
    .join("");

  await resend.emails.send({
    from: reminderFrom(),
    to: process.env.COACH_EMAIL,
    subject: `⏰ ${overdue.length} joueur(s) sans rencontre individuelle depuis 3+ semaines`,
    html: `
      <p>Bonjour,</p>
      <p>Les joueurs suivants n'ont pas eu de rencontre individuelle depuis au moins 3 semaines :</p>
      <ul>${listHtml}</ul>
      <p>— App As de Québec M17 AAA</p>
    `,
  });

  return { overdueCount: overdue.length, emailSent: true };
}

/**
 * Lundi matin : si l'alignement adverse manque pour un match du week-end
 * précédent, on rappelle à Philippe et Jeff (les adjoints) de le saisir.
 */
async function sendMissingLineupReminder(
  supabase: ReturnType<typeof createServiceClient>,
  origin: string,
  sinceKey?: string
) {
  const mondayKey = format(new Date(), "yyyy-MM-dd");
  const missing = await findMissingOpponentLineups(supabase, mondayKey, sinceKey);
  if (missing.length === 0) return { missing: 0, emailsSent: 0 };
  if (!process.env.RESEND_API_KEY) return { missing: missing.length, emailsSent: 0, reason: "RESEND_API_KEY missing" };

  // Un seul courriel, adressé aux deux : chacun voit l'autre dans les destinataires.
  const { data: coaches } = await supabase
    .from("coach_profiles")
    .select("id, full_name")
    .in("full_name", RECIPIENT_NAMES);
  const emails: string[] = [];
  for (const c of coaches ?? []) {
    const { data } = await supabase.auth.admin.getUserById(c.id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  if (emails.length === 0) return { missing: missing.length, emailsSent: 0, reason: "no recipient email" };

  const mail = buildMissingLineupEmail(missing, origin, !!sinceKey);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: reminderFrom(),
    to: emails,
    replyTo: process.env.COACH_EMAIL || undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  return { missing: missing.length, recipients: emails.length, emailsSent: error ? 0 : 1, error: error?.message ?? null };
}

async function sendLineupReminderTest(
  supabase: ReturnType<typeof createServiceClient>,
  origin: string,
  date: string | null
) {
  const missing = await findMissingOpponentLineups(supabase, date ?? format(new Date(), "yyyy-MM-dd"));
  if (missing.length === 0) return { test: true, v: 2, missing: 0, emailSent: false };
  if (!process.env.RESEND_API_KEY || !process.env.COACH_EMAIL) {
    return { test: true, missing: missing.length, emailSent: false, reason: "RESEND_API_KEY or COACH_EMAIL missing" };
  }
  const mail = buildMissingLineupEmail(missing, origin, false);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: reminderFrom(),
    to: process.env.COACH_EMAIL,
    subject: `[ESSAI] ${mail.subject}`,
    html: mail.html,
    text: mail.text,
  });
  return { test: true, missing: missing.length, emailSent: !error, error: error?.message ?? null };
}

const RECIPIENT_NAMES = ["Philippe Tremblay", "Jeff St-Louis"];

/**
 * Adresse d'expédition des rappels : celle du courriel pro (COACH_EMAIL), dont
 * le domaine est déjà vérifié chez Resend — c'est elle qui sert à l'envoi des
 * courriels depuis l'app. REMINDER_FROM_EMAIL pointait vers un domaine non
 * vérifié (« votredomaine.com ») et faisait échouer tous les rappels.
 */
function reminderFrom(): string {
  const coach = process.env.COACH_EMAIL;
  if (coach) return `App As de Québec M17 <${coach}>`;
  return process.env.REMINDER_FROM_EMAIL || "rappels@resend.dev";
}

async function sendTestsFicheTest(supabase: ReturnType<typeof createServiceClient>, nameFragment: string, session: string) {
  const coachEmail = process.env.COACH_EMAIL;
  if (!process.env.RESEND_API_KEY || !coachEmail) return { ok: false, error: "RESEND_API_KEY ou COACH_EMAIL manquant" };
  const [{ data: players }, { data: results }] = await Promise.all([
    supabase.from("players").select("id, full_name").eq("active", true).eq("is_call_up", false),
    supabase.from("player_test_results").select("player_id, test_name, value, unit, higher_is_better, test_date").limit(20000),
  ]);
  const player = (players ?? []).find((p) => p.full_name.toLowerCase().includes(nameFragment.toLowerCase()));
  if (!player) return { ok: false, error: "Joueur introuvable" };
  const all = (results ?? []) as TestResultLike[];
  const fiche = computeFiche(player.id, session, all, new Set((players ?? []).map((p) => p.id)));
  if (fiche.rows.length === 0) return { ok: false, error: "Aucun résultat" };
  const first = player.full_name.split(" ")[0];
  const message = `Salut ${first},\n\nVoici tes résultats aux tests physiques (${fiche.sessionLabel}) : ton classement dans l'équipe${
    fiche.previousLabel ? ` et ton évolution depuis ${fiche.previousLabel}` : ""
  }.\n\nContinue le beau travail !`;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `Jean Grignon-Francke <${coachEmail}>`,
    to: [coachEmail],
    replyTo: coachEmail,
    subject: `[TEST] Tes résultats aux tests physiques ${fiche.sessionLabel} — As de Québec M17 AAA`,
    html: buildEmailHtml(message, ficheHtml(player.full_name, fiche)),
    text: buildEmailText(message),
    attachments: [{ filename: "signature.jpg", content: EMAIL_SIGNATURE_BASE64, contentId: EMAIL_SIGNATURE_CID }],
  });
  return { ok: !error, error: error?.message ?? null, player: player.full_name, rows: fiche.rows.length };
}
