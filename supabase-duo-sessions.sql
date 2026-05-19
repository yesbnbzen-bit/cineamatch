-- ═══════════════════════════════════════════════════════════
--  CineMatch IA — Table duo_sessions
--  Sync cross-device pour le Mode Duo
--  À exécuter dans : Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

create table if not exists duo_sessions (
    id            text primary key,                                         -- ID court (ex: "AB3KP9MX")
    name_a        text default '',                                          -- Prénom Personne A
    answers_a     jsonb not null,                                           -- Réponses Personne A
    status        text default 'waiting'                                    -- 'waiting' | 'responding' | 'done'
                      check (status in ('waiting', 'responding', 'done')),
    name_b        text,                                                     -- Prénom Personne B (renseigné après)
    b_raw_answers jsonb,                                                    -- Réponses brutes Personne B
    final_movies  jsonb,                                                    -- Films recommandés (calculés par B)
    final_answers jsonb,                                                    -- Réponses fusionnées
    created_at    timestamptz default now(),
    expires_at    timestamptz default (now() + interval '24 hours')
);

-- Index sur expires_at pour le nettoyage
create index if not exists duo_sessions_expires_at_idx on duo_sessions(expires_at);

-- ── Sécurité : accès public en lecture/écriture (session ID = secret partagé) ──
-- Les sessions expirent après 24h et ne contiennent pas de données sensibles.
alter table duo_sessions enable row level security;

create policy "Lecture publique duo_sessions"
    on duo_sessions for select
    using (true);

create policy "Création publique duo_sessions"
    on duo_sessions for insert
    with check (true);

create policy "Mise à jour publique duo_sessions"
    on duo_sessions for update
    using (true);

-- ── Nettoyage automatique des sessions expirées ──
-- (optionnel — à activer si pg_cron est disponible sur ton plan Supabase)
-- select cron.schedule('cleanup-duo-sessions', '0 * * * *',
--     $$ delete from duo_sessions where expires_at < now() $$);
