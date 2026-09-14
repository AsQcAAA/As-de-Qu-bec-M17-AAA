import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Gate the whole app behind Supabase Auth. Only signed-in coaches (invited
// by the head coach, see /coachs) can reach any page — the roster and
// player data belong to minors, so there is no public route besides the
// auth pages themselves.
// /logos ne contient que des écussons d'équipes de la ligue, publics par
// nature : sans cette exception, la requête d'image passait par le mur d'auth
// et repartait en redirection vers /login au lieu de servir le fichier.
const PUBLIC_PATHS = ["/login", "/definir-mot-de-passe", "/api/reminders", "/logos"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(req);

  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
