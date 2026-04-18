-- ═══════════════════════════════════════════════════════════
--  CineMatch IA — Schéma Supabase
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════

-- 1. PROFILS UTILISATEURS
-- (complète la table auth.users gérée par Supabase)
create table if not exists profiles (
    id         uuid references auth.users(id) on delete cascade primary key,
    name       text,
    avatar_url text,
    created_at timestamptz default now()
);

-- Créer un profil automatiquement à chaque inscription
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, name, avatar_url)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url'
    );
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();


-- 2. WATCHLIST
create table if not exists watchlist (
    id          bigserial primary key,
    user_id     uuid references auth.users(id) on delete cascade not null,
    movie_id    integer not null,
    title       text,
    poster_path text,
    year        text,
    added_at    timestamptz default now(),
    unique(user_id, movie_id)
);


-- 3. HISTORIQUE DES RECOMMANDATIONS
create table if not exists history (
    id               bigserial primary key,
    user_id          uuid references auth.users(id) on delete cascade not null,
    movie_id         integer not null,
    title            text,
    poster_path      text,
    year             text,
    genre_ids        integer[],
    mood             text,
    match_score      integer,
    recommended_at   timestamptz default now()
);


-- 4. NOTATIONS & "DÉJÀ VU"
create table if not exists ratings (
    id          bigserial primary key,
    user_id     uuid references auth.users(id) on delete cascade not null,
    movie_id    integer not null,
    title       text,
    poster_path text,
    rating      integer check (rating between 1 and 5),
    seen        boolean default false,
    rated_at    timestamptz default now(),
    unique(user_id, movie_id)
);


-- ═══════════════════════════════════════════════════════════
--  SÉCURITÉ — Row Level Security (RLS)
--  Chaque utilisateur ne voit que ses propres données
-- ═══════════════════════════════════════════════════════════

alter table profiles  enable row level security;
alter table watchlist enable row level security;
alter table history   enable row level security;
alter table ratings   enable row level security;

-- Profiles
create policy "Lecture profil personnel" on profiles
    for select using (auth.uid() = id);
create policy "Modification profil personnel" on profiles
    for update using (auth.uid() = id);

-- Watchlist
create policy "Watchlist personnelle" on watchlist
    for all using (auth.uid() = user_id);

-- History
create policy "Historique personnel" on history
    for all using (auth.uid() = user_id);

-- Ratings
create policy "Notations personnelles" on ratings
    for all using (auth.uid() = user_id);
