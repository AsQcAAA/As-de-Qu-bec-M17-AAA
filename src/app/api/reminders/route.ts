import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { computeMeetingStatuses } from "@/lib/meetings";
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
async function sendMissingLineupReminder(supabase: ReturnType<typeof createServiceClient>, origin: string) {
  const mondayKey = format(new Date(), "yyyy-MM-dd");
  const missing = await findMissingOpponentLineups(supabase, mondayKey);
  if (missing.length === 0) return { missing: 0, emailsSent: 0 };
  if (!process.env.RESEND_API_KEY) return { missing: missing.length, emailsSent: 0, reason: "RESEND_API_KEY missing" };

  const { data: coaches } = await supabase
    .from("coach_profiles")
    .select("id, full_name")
    .in("full_name", RECIPIENT_NAMES);
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  for (const c of coaches ?? []) {
    const { data } = await supabase.auth.admin.getUserById(c.id);
    const to = data?.user?.email;
    if (!to) continue;
    const mail = buildMissingLineupEmail(missing, origin, c.full_name.split(" ")[0]);
    const { error } = await resend.emails.send({
      from: reminderFrom(),
      to,
      replyTo: process.env.COACH_EMAIL || undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
    if (!error) sent += 1;
  }
  return { missing: missing.length, emailsSent: sent };
}

async function sendLineupReminderTest(
  supabase: ReturnType<typeof createServiceClient>,
  origin: string,
  date: string | null
) {
  const missing = await findMissingOpponentLineups(supabase, date ?? format(new Date(), "yyyy-MM-dd"));
  if (missing.length === 0) return { test: true, missing: 0, emailSent: false };
  if (!process.env.RESEND_API_KEY || !process.env.COACH_EMAIL) {
    return { test: true, missing: missing.length, emailSent: false, reason: "RESEND_API_KEY or COACH_EMAIL missing" };
  }
  const mail = buildMissingLineupEmail(missing, origin, "Philippe");
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
