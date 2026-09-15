import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Définit directement un mot de passe pour un utilisateur — contourne
 * complètement le courriel d'invitation/réinitialisation.
 *
 * Utile quand le lien par courriel est systématiquement grillé avant que la
 * personne ne clique : certains fournisseurs (comptes professionnels
 * Outlook/Microsoft 365, Google Workspace) font visiter automatiquement tous
 * les liens reçus par courriel pour les scanner contre l'hameçonnage — les
 * liens d'invitation étant à usage unique, ce scan les consomme avant la
 * vraie personne. Le mot de passe temporaire choisi ici doit être transmis à
 * la main (texto, appel) plutôt que par courriel, pour la même raison.
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
    return NextResponse.json({ error: "Seul un entraîneur-chef peut définir un mot de passe." }, { status: 403 });
  }

  const { coachId, password } = (await req.json()) as { coachId: string; password: string };
  if (!coachId || !password) {
    return NextResponse.json({ error: "coachId et password requis." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères." }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(coachId, { password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
