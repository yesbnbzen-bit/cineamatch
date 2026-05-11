// ─────────────────────────────────────────────────────────────────
//  Cloudflare Pages Function — Recevoir les webhooks Stripe
//  POST /api/stripe-webhook
//
//  Variables d'environnement à configurer dans Cloudflare Pages :
//    STRIPE_WEBHOOK_SECRET      → whsec_... (depuis Stripe Dashboard → Webhooks)
//    SUPABASE_URL               → https://xxxx.supabase.co
//    SUPABASE_SERVICE_ROLE_KEY  → clé service role (pas la clé anon !)
//
//  Événements Stripe à activer dans le dashboard :
//    - checkout.session.completed
//    - customer.subscription.updated
//    - customer.subscription.deleted
//    - invoice.payment_failed
// ─────────────────────────────────────────────────────────────────

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    // Lire le body brut AVANT toute autre opération (nécessaire pour la vérification HMAC)
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    // Vérifier la signature Stripe
    const isValid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
        console.error('Stripe webhook: invalid signature');
        return new Response('Invalid signature', { status: 400 });
    }

    let event;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }

    console.log(`Stripe event: ${event.type}`);

    try {
        switch (event.type) {

            // ── Paiement réussi (abonnement OU achat unique à vie) ──
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId  = session.metadata?.userId;
                const plan    = session.metadata?.plan;

                if (!userId) {
                    console.warn('checkout.session.completed: no userId in metadata');
                    break;
                }

                await setPremiumStatus(env, userId, true, plan, {
                    stripeCustomerId:    session.customer,
                    stripeSubscriptionId: session.subscription || null, // null pour lifetime
                });
                console.log(`✅ Premium activé — userId: ${userId}, plan: ${plan}`);
                break;
            }

            // ── Abonnement mis à jour (renouvellement, changement de plan) ──
            case 'customer.subscription.updated': {
                const sub    = event.data.object;
                const userId = sub.metadata?.userId;
                if (!userId) break;

                const isActive = ['active', 'trialing'].includes(sub.status);
                await setPremiumStatus(env, userId, isActive, sub.metadata?.plan || null, {
                    stripeCustomerId:    sub.customer,
                    stripeSubscriptionId: sub.id,
                });
                console.log(`🔄 Abonnement mis à jour — userId: ${userId}, actif: ${isActive}`);
                break;
            }

            // ── Abonnement annulé ──
            case 'customer.subscription.deleted': {
                const sub    = event.data.object;
                const userId = sub.metadata?.userId;
                if (!userId) break;

                await setPremiumStatus(env, userId, false, null, {
                    stripeCustomerId:    sub.customer,
                    stripeSubscriptionId: sub.id,
                });
                console.log(`❌ Premium révoqué (annulation) — userId: ${userId}`);
                break;
            }

            // ── Échec de paiement ──
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                // Récupérer userId via la subscription si disponible
                const subId = invoice.subscription;
                if (subId && env.STRIPE_SECRET_KEY) {
                    try {
                        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
                            headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` }
                        });
                        const sub    = await subRes.json();
                        const userId = sub.metadata?.userId;
                        if (userId) {
                            await setPremiumStatus(env, userId, false, null, {
                                stripeCustomerId:    invoice.customer,
                                stripeSubscriptionId: subId,
                            });
                            console.log(`⚠️ Premium révoqué (paiement échoué) — userId: ${userId}`);
                        }
                    } catch (err) {
                        console.error('Erreur récupération subscription:', err);
                    }
                }
                break;
            }

            default:
                console.log(`Événement ignoré: ${event.type}`);
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error('Webhook handler error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// ─────────────────────────────────────────────────────────────────
//  Mettre à jour le statut premium dans Supabase
// ─────────────────────────────────────────────────────────────────
async function setPremiumStatus(env, userId, isPremium, plan, { stripeCustomerId, stripeSubscriptionId } = {}) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Supabase env vars not configured');
    }

    const headers = {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
    };

    // 1. Mettre à jour les métadonnées de l'utilisateur Supabase Auth
    const metaRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
            user_metadata: { is_premium: isPremium }
        })
    });

    if (!metaRes.ok) {
        const err = await metaRes.text();
        throw new Error(`Supabase user update failed: ${err}`);
    }

    // 2. Upsert dans la table subscriptions
    const subRes = await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
        method: 'POST',
        headers: {
            ...headers,
            'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
            user_id:               userId,
            is_premium:            isPremium,
            plan:                  plan || null,
            stripe_customer_id:    stripeCustomerId || null,
            stripe_subscription_id: stripeSubscriptionId || null,
            updated_at:            new Date().toISOString(),
        })
    });

    if (!subRes.ok) {
        const err = await subRes.text();
        console.warn(`Subscriptions upsert warning: ${err}`); // non bloquant
    }
}

// ─────────────────────────────────────────────────────────────────
//  Vérification signature HMAC-SHA256 Stripe
//  (Web Crypto API — disponible dans les Cloudflare Workers)
// ─────────────────────────────────────────────────────────────────
async function verifyStripeSignature(rawBody, sigHeader, secret) {
    if (!sigHeader || !secret) return false;

    // Parser l'en-tête "t=timestamp,v1=signature"
    const parts = {};
    sigHeader.split(',').forEach(part => {
        const [k, v] = part.split('=');
        if (k && v) parts[k.trim()] = v.trim();
    });

    const timestamp = parts['t'];
    const v1sig     = parts['v1'];
    if (!timestamp || !v1sig) return false;

    // Vérifier que le timestamp n'est pas trop vieux (5 minutes max)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
        console.warn('Stripe webhook: timestamp trop vieux');
        return false;
    }

    // Calculer la signature HMAC-SHA256 attendue
    const signedPayload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(signedPayload)
    );

    const computedSig = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return computedSig === v1sig;
}
