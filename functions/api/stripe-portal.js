// ─────────────────────────────────────────────────────────────────
//  Cloudflare Pages Function — Portail client Stripe (gérer / résilier)
//  POST /api/stripe-portal
//  Header : Authorization: Bearer <supabase_access_token>
//
//  Sécurité : on NE fait PAS confiance à un userId envoyé par le client.
//  On valide le token Supabase de l'utilisateur, on en déduit son vrai userId,
//  puis on récupère SON stripe_customer_id. Impossible d'ouvrir le portail
//  d'un autre utilisateur.
//
//  Variables d'environnement (déjà présentes) :
//    STRIPE_SECRET_KEY            → sk_live_...
//    SUPABASE_URL
//    SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────

// Clé anon Supabase (publique — sert juste à valider le token utilisateur)
const SUPABASE_ANON = 'sb_publishable_z2dX34NgOMVj4spzMWF1-w_fQOWQb0x';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS_HEADERS });
    if (request.method !== 'POST')   return json({ error: 'Method Not Allowed' }, 405);

    if (!env.STRIPE_SECRET_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return json({ error: 'Service non configuré' }, 500);
    }

    // 1. Valider le token utilisateur → récupérer le vrai userId
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return json({ error: 'Non authentifié' }, 401);

    let userId = null;
    try {
        const uRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
        });
        if (!uRes.ok) return json({ error: 'Session invalide, reconnecte-toi.' }, 401);
        const u = await uRes.json();
        userId = u?.id || null;
    } catch {
        return json({ error: 'Session invalide, reconnecte-toi.' }, 401);
    }
    if (!userId) return json({ error: 'Session invalide, reconnecte-toi.' }, 401);

    // 2. Récupérer le stripe_customer_id de CET utilisateur (clé service role)
    let customerId = null;
    try {
        const sRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=stripe_customer_id&order=updated_at.desc&limit=1`,
            { headers: { 'apikey': env.SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }
        );
        const rows = await sRes.json();
        customerId = Array.isArray(rows) && rows[0]?.stripe_customer_id || null;
    } catch { /* ignore */ }

    if (!customerId) {
        return json({ error: "Aucun abonnement actif trouvé sur ce compte." }, 404);
    }

    // 3. Créer une session de portail client Stripe
    try {
        const origin = new URL(request.url).origin;
        const params = new URLSearchParams({
            customer: customerId,
            return_url: `${origin}/?premium=managed`,
        });
        const pRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString()
        });
        const session = await pRes.json();
        if (!pRes.ok) {
            console.error('Stripe portal error:', session);
            return json({ error: session.error?.message || 'Erreur portail Stripe' }, 500);
        }
        return json({ url: session.url });
    } catch (err) {
        console.error('Portal handler error:', err);
        return json({ error: err.message }, 500);
    }
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}
