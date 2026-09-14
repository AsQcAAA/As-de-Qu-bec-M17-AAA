"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Nav from "./Nav";

const NO_SIDEBAR_ROUTES = ["/login", "/definir-mot-de-passe"];
// Le calendrier profite d'une page plus large pour agrandir les cases.
const WIDE_ROUTES = ["/calendrier"];

// Photos floues d'équipe en rotation — une est tirée au hasard (différente de
// la précédente) à chaque changement de page, pour que le fond varie en
// naviguant dans l'app plutôt que de rester figé sur une seule photo.
const BACKGROUNDS = [
  "/backgrounds/rink-action.jpg",
  "/backgrounds/bg-4.jpg",
  "/backgrounds/bg-6.jpg",
  "/backgrounds/bg-7.jpg",
  "/backgrounds/bg-8.jpg",
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Les pages de diffusion sont castées sur la télé du vestiaire : ni menu, ni
  // marges, ni fond photo — l'écran ne doit montrer que l'horaire.
  const isCast = pathname.startsWith("/diffusion");
  const hasSidebar = !isCast && !NO_SIDEBAR_ROUTES.includes(pathname);
  const isWide = WIDE_ROUTES.includes(pathname);
  const lastIndex = useRef(-1);

  useEffect(() => {
    let next = Math.floor(Math.random() * BACKGROUNDS.length);
    if (BACKGROUNDS.length > 1 && next === lastIndex.current) {
      next = (next + 1) % BACKGROUNDS.length;
    }
    lastIndex.current = next;
    document.documentElement.style.setProperty("--bg-photo", `url(${BACKGROUNDS[next]})`);
  }, [pathname]);

  if (isCast) return <main className="min-h-screen bg-ink-900">{children}</main>;

  return (
    <>
      <Nav />
      <main className={hasSidebar ? "md:pl-56 min-h-screen" : "min-h-screen"}>
        <div className={hasSidebar ? `${isWide ? "max-w-[1600px]" : "max-w-6xl"} mx-auto px-4 py-6` : ""}>{children}</div>
      </main>
    </>
  );
}
