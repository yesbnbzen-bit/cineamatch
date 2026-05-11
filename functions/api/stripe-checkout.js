// ─────────────────────────────────────────────────────────────────
//  Cloudflare Pages Function — Créer une session Stripe Checkout
//  POST /api/stripe-checkout
//  Body JSON : { plan: 'monthly'|'yearly'|'lifetime', userId, email }
//
//  Variables d'environnement à configurer dans Cloudflare Pages :
//    STRIPE_SECRET_KEY        → sk_live_... (ou sk_test_... en dev)
//    STRIPE_PRICE_MONTHLY     → price_... (ID du prix mensuel dans Stripe)
//    STRIPE_PRICE_YEARLY      → price_... (ID du prix annuel)
//    STRIPE_PRICE_LIFETIME    → price_... (ID du prix à vie)
// ─────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
        return json({ error: 'Method Not Allowed' }, 405);
    }

    let plan, userId, email;
    try {
        ({ plan, userId, email } = await request.json());
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    if (!plan || !userId || !email) {
        return json({ error: 'Missing required fields: plan, userId, email' }, 400);
    }

    const priceMap = {
        monthly:  env.STRIPE_PRICE_MONTHLY,
        yearly:   env.STRIPE_PRICE_YEARLY,
        lifetime: env.STRIPE_PRICE_LIFETIME,
    };

    const priceId = priceMap[plan];
    if (!priceId) {
        return json({ error: `Invalid plan: ${plan}` }, 400);
    }

    if (!env.STRIPE_SECRET_KEY) {
        return json({ error: 'Stripe not configured' }, 500);
    }

    try {
        const origin = new URL(request.url).origin;
        const isLifetime = plan === 'lifetime';

        // Construire les paramètres pour l'API Stripe (form-encoded)
        const params = {
            mode: isLifetime ? 'payment' : 'subscription',
            customer_email: email,
            'line_items[0][price]': priceId,
            'line_items[0][quantity]': '1',
            'success_url': `${origin}/?premium=success&session_id={CHECKOUT_SESSION_ID}`,
            'cancel_url': `${origin}/?premium=cancel`,
            'metadata[userId]': userId,
            'metadata[plan]': plan,
            // Permettre l'enregistrement de la carte pour les futurs paiements
            'payment_method_collection': 'always',
        };

        // Pour les abonnements : passer aussi userId dans subscription_data.metadata
        // afin de le récupérer dans les webhooks subscription.*
        if (!isLifetime) {
            params['subscription_data[metadata][userId]'] = userId;
            params['subscription_data[metadata][plan]']   = plan;
        }

        // Activer la gestion des taxes automatique (optionnel)
        // params['automatic_tax[enabled]'] = 'true';

        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(params).toString()
        });

        const session = await stripeRes.json();

        if (!stripeRes.ok) {
            console.error('Stripe error:', session);
            return json({ error: session.error?.message || 'Stripe checkout error' }, 500);
        }

        return json({ url: session.url });

    } catch (err) {
        console.error('Checkout error:', err);
        return json({ error: err.message }, 500);
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}
