# CineaMatch IA — Référence Projet

## Services & Clés

### Supabase
- **URL** : `https://wyikiuwcygaemjzwbltk.supabase.co`
- **Anon key** : `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5aWtpdXdjeWdhZW1qendibHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMjU2ODMsImV4cCI6MjA5MTYwMTY4M30.sb_publishable_z2dX34NgOMVj4spzMWF1-w_fQOWQb0x` *(dans le code)*
- **Service role key** : *(dans Cloudflare env vars — ne pas exposer)*
- **Dashboard** : https://supabase.com/dashboard/project/wyikiuwcygaemjzwbltk

### Stripe (MODE TEST)
- **Compte** : yesbnbzen@gmail.com
- **Dashboard test** : https://dashboard.stripe.com/test
- **Clé publique** : `pk_test_51TY71t2SDTIiiDyr...` *(dans app.js si nécessaire)*
- **Clé secrète** : *(dans Cloudflare env vars — STRIPE_SECRET_KEY)*
- **Webhook secret** : *(dans Cloudflare env vars — STRIPE_WEBHOOK_SECRET)*
- **Produit Mensuel** : `prod_UXBdmfFMAueqWP` → Prix : `price_1TY7GO2SDTIiiDyrrlHIpkMx` (4,99€/mois)
- **Produit Annuel** : `prod_UXBfpDkVBtUjMQ` → Prix : `price_1TY7I52SDTIiiDyr6oDQjS8a` (39,99€/an)
- **Webhook endpoint** : `https://cineamatch.com/api/stripe-webhook`
- **Événements écoutés** : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### TMDB
- **Clé API** : *(dans Cloudflare env vars — TMDB_API_KEY)*
- IDs plateformes FR : Netflix=8, Prime Video=119, Apple TV+=350, Canal+=381, Disney+=337, Max=1899

### OpenAI
- **Clé API** : *(dans Cloudflare env vars — OPENAI_API_KEY)*

### Cloudflare Pages
- **Projet** : `cineamatch`
- **Domaine** : `cineamatch.com`
- **GitHub** : `yesbnbzen-bit/cineamatch`
- **Variables d'env** : Settings → Variables and Secrets

---

## Schéma Base de Données Supabase

### Table : `profiles`
Créée automatiquement à l'inscription.
```sql
-- gérée via auth.users + upsert dans authService.signUp()
```

### Table : `watchlist`
```sql
create table public.watchlist (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references auth.users(id) on delete cascade,
    movie_id    integer not null,
    title       text,
    poster_path text,
    year        text,
    added_at    timestamptz default now()
);
```

### Table : `history` (films vus)
```sql
-- gérée via historyService dans services/supabase.js
```

### Table : `ratings` (notes films)
```sql
-- gérée via ratingsService dans services/supabase.js
```

### Table : `subscriptions` ✅ CRÉÉE LE 17/05/2026
```sql
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
alter table public.subscriptions enable row level security;
create policy "Users can view own subscription"
    on public.subscriptions for select
    using (auth.uid() = user_id);
```

---

## Architecture Technique

### Frontend
- Vanilla JS (ES Modules), CSS custom, HTML
- Déployé sur Cloudflare Pages via GitHub push
- Versioning cache-busting : `app.js?v=409`, `store.js?v=44`, `auth.js?v=22`, etc.

### Cloudflare Functions (serverless)
- `/api/stripe-checkout` → crée session Stripe Checkout
- `/api/stripe-webhook` → reçoit événements Stripe, met à jour Supabase
- `/api/openai` → proxy OpenAI
- `/api/tmdb` → proxy TMDB

### Flux Premium
1. Utilisateur clique "⚡ Premium" → `App.showPricingModal()`
2. Choisit plan → `App.startCheckout('monthly'|'yearly')`
3. POST `/api/stripe-checkout` → reçoit URL Stripe → redirect
4. Paiement Stripe → webhook → `/api/stripe-webhook`
5. Webhook met `is_premium: true` dans `auth.users.user_metadata` + table `subscriptions`
6. Retour sur `/?premium=success` → `handleStripeReturn()` → toast succès

### Limites rerolls
- Anonyme : 2 rerolls max
- Connecté (gratuit) : 10 rerolls
- Premium : 10 rerolls (illimité à terme quand Stripe live)

### Comptes admin / test
- `yesbnbzen@gmail.com`
- `lalycapslaly@hotmail.fr`

---

## Reste à faire avant lancement

- [ ] Passer Stripe en mode **production** (clés `sk_live_...`)
- [ ] Corriger Google OAuth branding (Google Cloud Console)
- [ ] Rédiger pages légales (CGU, Confidentialité, Mentions légales)
- [ ] Ajouter balises SEO / Open Graph dans index.html
- [ ] Tester paiement end-to-end en mode test

---

## Historique des décisions importantes

| Date | Décision |
|------|----------|
| 2026-05 | Tarification : 4,99€/mois · 39,99€/an · pas d'essai gratuit |
| 2026-05 | Stripe en mode test → production après validation |
| 2026-05 | Table subscriptions créée dans Supabase |
| 2026-05 | Rerolls : anonyme=2, connecté=10 |
| 2026-05 | Option app mobile : Capacitor (option 2) après validation web |
