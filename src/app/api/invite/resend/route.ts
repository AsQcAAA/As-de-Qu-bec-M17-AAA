import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Renvoie l'accès à un utilisateur déjà invité — utile si le courriel
 * d'origine s'est perdu ou a expiré. coach_profiles ne stocke pas le
 * courriel (déjà dans auth.users) : on le retrouve via l'API admin à partir
 * de l'identifiant du coach, jamais saisi à la main.
 *
 * Deux cas possibles côté Supabase :
 *  - la personne n'a jamais choisi son mot de passe → on peut réinviter
 *    directement, ça renvoie le même courriel d'invitation ;
 *  - elle l'a déjà fait (compte confirmé) → l'invitation échoue, on retombe
 *    alors sur un courriel de réinitialisation, qui mène à la même page.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("coach_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "head_coach") {
    return NextResponse.json({ error: "Seul un entraîneur-chef peut renvoyer une invitation." }, { status: 403 });
  }

  const { coachId } = (await req.json()) as { coachId: string };
  if (!coachId) {
    return NextResponse.json({ error: "coachId requis." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: target, error: getError } = await service.auth.admin.getUserById(coachId);
  const email = target?.user?.email;
  if (getError || !email) {
    return NextResponse.json({ error: "Impossible de retrouver le courriel de cette personne." }, { status: 404 });
  }

  const siteUrl = req.nextUrl.origin;
  const redirectTo = `${siteUrl}/definir-mot-de-passe`;

  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!inviteError) {
    return NextResponse.json({ ok: true, mode: "invite" });
  }

  const { error: resetError } = await service.auth.resetPasswordForEmail(email, { redirectTo });
  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, mode: "reset" });
}
