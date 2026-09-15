"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Crest from "./Crest";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/", label: "Accueil" },
  { href: "/resultats", label: "Résultats" },
  { href: "/calendrier", label: "Calendrier" },
  { href: "/planification-hebdo", label: "Planification hebdo" },
  { href: "/rapport-quotidien", label: "Rapports" },
  { href: "/alignements", label: "Alignements" },
  { href: "/joueurs", label: "Joueurs" },
  { href: "/pointeurs", label: "Statistiques individuelles" },
  { href: "/statistiques-equipe", label: "Statistiques d'équipe" },
  { href: "/statistiques-avancees", label: "Statistiques avancées" },
  { href: "/statistiques-avancees/pre-scout", label: "Pre-Scout" },
  { href: "/responsabilites", label: "Responsabilités" },
  { href: "/farandole", label: "Farandole" },
  { href: "/tests-physiques", label: "Tests physiques" },
  { href: "/stats-combos", label: "Combinaisons" },
  { href: "/reunions", label: "Meeting" },
  { href: "/medical", label: "Médical" },
  { href: "/remplacants", label: "Remplaçants" },
  { href: "/canva", label: "Canva" },
  { href: "/coachs", label: "Utilisateurs" },
];

// Onglet visible uniquement pour l'entraîneur-chef — la protection réelle
// est côté RLS (voir migration_014.sql), ceci évite juste de l'afficher
// aux entraîneurs adjoints invités.
const HEAD_COACH_ONLY_TAB = { href: "/direction-generale", label: "Direction générale" };

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isHeadCoach, setIsHeadCoach] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    async function checkRole() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("coach_profiles").select("role").eq("id", user.id).single();
      setIsHeadCoach(data?.role === "head_coach");
    }
    checkRole();
  }, []);

  const tabs = isHeadCoach ? [...TABS, HEAD_COACH_ONLY_TAB] : TABS;

  if (pathname === "/login" || pathname === "/definir-mot-de-passe") return null;

  async function signOut() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-black text-white border-b border-gold-900/40 flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Crest className="h-8 w-8" />
          <span className="font-bold tracking-tight leading-tight text-sm">
            As de Québec
            <span className="block text-[10px] font-normal text-gold-400">M17 AAA</span>
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="px-3 py-1.5 rounded-md text-gold-400 hover:bg-ink-700 transition-colors"
          aria-label="Menu"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>
      <div className="md:hidden h-14" />

      {mobileOpen && <div className="md:hidden fixed inset-0 z-20 bg-black/60" onClick={() => setMobileOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-20 w-56 shrink-0 bg-black text-white border-r border-gold-900/40 flex flex-col overflow-y-auto transition-transform md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link href="/" className="flex items-center gap-2 px-4 py-4 shrink-0 border-b border-white/10">
          <Crest className="h-9 w-9" />
          <span className="font-bold tracking-tight leading-tight">
            As de Québec
            <span className="block text-xs font-normal text-gold-400">M17 AAA</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-1 text-sm p-3 flex-1">
          {tabs.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMobileOpen(false)}
                className={`px-3 py-2 rounded-md transition-colors border ${
                  active
                    ? "bg-gold-500 text-ink-900 font-bold border-gold-400"
                    : "text-white border-transparent hover:bg-white/15 hover:border-white/20"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="text-left px-4 py-3 text-sm text-gold-400 hover:bg-white/15 transition-colors border-t border-white/10 shrink-0"
        >
          Déconnexion
        </button>
      </aside>
    </>
  );
}
