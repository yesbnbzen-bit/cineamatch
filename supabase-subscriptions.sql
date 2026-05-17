-- ─────────────────────────────────────────────────────────────────
--  CineaMatch IA — Table subscriptions
--  À exécuter dans Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.subscriptions (
    id                      uuid primary key default gen_random_uuid(),
    user_id                 uuid not null references auth.users(id) on delete cascade,
    is_premium              boolean not null default false,
    plan                    text,           -- 'monthly' | 'yearly' | 'lifetime'
    stripe_customer_id      text,
    stripe_subscription_id  text,
    updated_at              timestamptz not null default now(),
    created_at              timestamptz not null default now(),

    constraint subscriptions_user_id_key unique (user_id)
);

-- Index pour les lookups rapides
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_stripe_customer_idx on public.subscriptions(stripe_customer_id);

-- RLS : l'utilisateur peut lire sa propre ligne, le service role peut tout faire
alter table public.subscriptions enable row level security;

create policy "Users can view own subscription"
    on public.subscriptions for select
    using (auth.uid() = user_id);

-- Le webhook Stripe utilise la clé service_role → bypass RLS automatique
