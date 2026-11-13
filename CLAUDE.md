@AGENTS.md

# Projet : As de Québec M17 AAA (app du personnel)

- Interface et communications **en français** (vouvoiement avec les parents). L'utilisateur est l'entraîneur-chef, il écrit souvent depuis son iPhone : réponses courtes et claires.
- Stack : Next.js (App Router), React, Tailwind, Supabase (projet `xoutqemoipcglmjecrgg`), Resend pour les courriels, déploiement Vercel automatique à chaque push sur `main`. Domaine de production : https://as-de-qu-bec-m17-aaa.vercel.app
- `src/proxy.ts` protège toute l'app par connexion Supabase, sauf `PUBLIC_PATHS` (actuellement `/rendez-vous` et `/api/rendez-vous`, pour les parents).

## Règles de travail
- **Toujours `git commit` + `git push` sur `main` après chaque modification de code**, sans attendre qu'on le demande. Terminer le message de commit par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Vérifier avec `npx tsc --noEmit` (et `npm run build` si le changement est important) avant de pousser.
- **Migrations Supabase** : créer `supabase/migration_NNN.sql` dans le dépôt (prochain numéro : 066) **et** l'appliquer à la base si un connecteur Supabase est disponible. Toute nouvelle table doit inclure `GRANT ... TO authenticated, service_role` (obligatoire dès le 30 oct. 2026). Demander avant toute opération destructive (drop, delete massif).
- Si aucun connecteur Supabase n'est disponible (session cloud), écrire la migration dans le dépôt et dire clairement à l'utilisateur qu'elle reste **à appliquer** dans l'éditeur SQL Supabase.
- Variables d'environnement utilisées (valeurs jamais dans le dépôt) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `COACH_EMAIL`, `REMINDER_FROM_EMAIL`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `TESTS_SHEET_ID`.
- Ne jamais envoyer de courriel aux parents ou aux joueurs sans demande explicite. Les essais d'envoi vont uniquement à l'entraîneur-chef.

## Fonctions clés
- **Rencontres bulletins** : `/bulletins` (staff), `/rendez-vous/[token]` (parents, public), tables `bulletin_slots` et `bulletin_links`, trigger `bulletin_sync_calendar` qui ajoute/retire l'événement au calendrier (`schedule_events`). Plages par public : `all` / `skaters` / `goalies` (gardien = `players.position = 'G'`).
- **Courriels** : `src/app/api/email/send/route.ts` (placeholders `{joueur}` et `{lien}`), signature PNG intégrée par CID (`src/lib/emailSignature.ts`).
- **Classements ligue** : une nouvelle capture du lundi remplace complètement les listes (retirer les joueurs absents, pas de stats périmées).
