-- Migration 009 — à exécuter dans l'éditeur SQL de Supabase.
-- Le bucket "player-photos" est public en LECTURE, mais Supabase Storage active
-- toujours le RLS sur storage.objects : sans politique explicite, l'upload
-- (INSERT/UPDATE) échoue silencieusement même si le bucket est "public".
-- Ceci ajoute les politiques manquantes pour permettre aux entraîneurs
-- connectés d'uploader des photos de joueurs.

create policy "player-photos - lecture publique"
  on storage.objects for select
  using (bucket_id = 'player-photos');

create policy "player-photos - upload authentifié"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'player-photos');

create policy "player-photos - mise à jour authentifiée"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'player-photos');

create policy "player-photos - suppression authentifiée"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'player-photos');

-- Lien direct vers la fiche joueur individuelle sur TPE (au lieu du lien
-- générique de l'équipe).
alter table players add column if not exists tpe_profile_url text;
