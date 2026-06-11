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

                // ── Email de bienvenue « membre Premium » (après paiement, en arrière-plan) ──
                // On passe l'email de la session en indice, mais sendPremiumWelcome ira le
                // chercher dans Supabase si besoin (plus fiable que customer_email en test).
                if (env.BREVO_API_KEY) {
                    const hintEmail = session.customer_details?.email || session.customer_email || null;
                    context.waitUntil(sendPremiumWelcome(env, userId, hintEmail, plan));
                }
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
            // On NE coupe PAS le Premium ici : Stripe relance automatiquement le paiement
            // pendant ~1 à 2 semaines (dunning). On prévient juste l'utilisateur par email
            // avec un lien pour régler / mettre à jour sa carte. La coupure définitive se
            // fait à l'annulation de l'abonnement (customer.subscription.deleted).
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const subId   = invoice.subscription;
                let userId = null;
                if (subId && env.STRIPE_SECRET_KEY) {
                    try {
                        const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
                            headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` }
                        });
                        const sub = await subRes.json();
                        userId = sub.metadata?.userId || null;
                    } catch (err) {
                        console.error('Erreur récupération subscription:', err);
                    }
                }
                if (userId && env.BREVO_API_KEY) {
                    const hintEmail = invoice.customer_email || null;
                    const payUrl    = invoice.hosted_invoice_url || 'https://cineamatch.com';
                    context.waitUntil(sendPaymentFailedEmail(env, userId, hintEmail, payUrl));
                }
                console.log(`⚠️ Paiement échoué (relances Stripe en cours) — userId: ${userId}`);
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

// ─────────────────────────────────────────────────────────────────
//  Email de bienvenue « membre Premium » (via API Brevo) après paiement
//  Nécessite l'env var BREVO_API_KEY (clé API v3 Brevo : xkeysib-...)
// ─────────────────────────────────────────────────────────────────
async function sendPremiumWelcome(env, userId, email, plan) {
    try {
        // Récupérer email + prénom depuis Supabase (source fiable, contrairement à
        // customer_email qui peut être vide en mode test Stripe).
        let name = '';
        try {
            const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
                headers: {
                    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
                }
            });
            if (r.ok) {
                const u = await r.json();
                name  = u?.user_metadata?.name || '';
                email = u?.email || email;   // priorité à l'email Supabase
            }
        } catch (e) { /* best effort */ }

        if (!email) { console.error('sendPremiumWelcome: aucun email'); return; }
        const prenom = name ? ` ${name}` : '';
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': env.BREVO_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: 'CineaMatch', email: 'noreply@cineamatch.com' },
                to: [{ email, name: name || email }],
                subject: 'Bienvenue dans CineaMatch Premium 🎬',
                htmlContent: premiumWelcomeHtml(prenom)
            })
        });
        if (!res.ok) console.error('Brevo premium welcome error:', await res.text());
    } catch (err) {
        console.error('sendPremiumWelcome error:', err);
    }
}

function premiumWelcomeHtml(prenom) {
    const feature = (icon, bg, title, sub) => `
        <tr><td style="padding:0 0 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td width="44" valign="top" style="width:44px;">
              <div style="width:38px;height:38px;border-radius:10px;background:${bg};text-align:center;line-height:38px;font-size:18px;">${icon}</div>
            </td>
            <td valign="middle" style="padding-left:12px;">
              <div style="font-size:14.5px;font-weight:700;color:#1a1a1a;line-height:1.3;">${title}</div>
              <div style="font-size:13px;color:#777;line-height:1.4;">${sub}</div>
            </td>
          </tr></table>
        </td></tr>`;
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef0;margin:0;padding:32px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">

      <!-- HERO -->
      <tr><td style="background:#0a0a0b;background-image:linear-gradient(135deg,#2a0410 0%,#0a0a0b 60%);padding:40px 32px 36px;text-align:center;">
        <span style="font-size:21px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">CINEA<span style="color:#E50914;">MATCH</span></span>
        <div style="margin:22px 0 0;display:inline-block;background:linear-gradient(135deg,#E50914,#ff525b);color:#fff;font-size:10.5px;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:7px 16px;border-radius:100px;box-shadow:0 4px 14px rgba(229,9,20,0.45);">⚡ Membre Premium</div>
        <h1 style="margin:16px 0 6px;font-size:27px;font-weight:800;color:#ffffff;line-height:1.2;letter-spacing:-0.5px;">Bienvenue${prenom} 🎬</h1>
        <p style="margin:0;font-size:14.5px;color:rgba(255,255,255,0.62);line-height:1.5;">Ton abonnement est <strong style="color:#fff;">actif</strong> — bienvenue dans le club.</p>
      </td></tr>

      <!-- INTRO + CTA -->
      <tr><td style="padding:32px 34px 6px;text-align:center;">
        <p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#444444;">
          Fini de scroller pendant une heure : l'IA te trouve <strong style="color:#111;">le film parfait en 30 secondes</strong>, selon ton envie du moment et tes plateformes.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 6px;">
          <tr><td style="border-radius:100px;background:#E50914;box-shadow:0 6px 20px rgba(229,9,20,0.4);">
            <a href="https://cineamatch.com" target="_blank" style="display:inline-block;padding:15px 44px;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:100px;">Trouver mon film →</a>
          </td></tr>
        </table>
      </td></tr>

      <!-- FEATURES -->
      <tr><td style="padding:24px 34px 6px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#999;margin-bottom:16px;">Tout est débloqué</div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          ${feature('🍿', '#fdeaec', 'Recommandations illimitées', 'Autant de recherches que tu veux, chaque jour')}
          ${feature('💑', '#fdeaec', 'Mode Duo', 'Le film parfait à deux, sans négocier')}
          ${feature('📺', '#eaf2fd', 'Filtre par plateformes', 'Netflix, Prime, Disney+, Canal+…')}
          ${feature('❤️', '#fdeaf4', 'Favoris &amp; historique', 'Retrouve tout ce que tu as aimé')}
        </table>
      </td></tr>

      <!-- TIP -->
      <tr><td style="padding:8px 34px 26px;">
        <div style="background:#faf7f2;border:1px solid #f0e9df;border-radius:14px;padding:16px 18px;">
          <p style="margin:0;font-size:13.5px;color:#6b5b46;line-height:1.55;">💡 <strong style="color:#4a3d2e;">Astuce :</strong> commence par noter 2-3 films que tu as adorés — plus tu utilises CineaMatch, mieux l'IA cerne tes goûts.</p>
        </div>
      </td></tr>

      <!-- FOOTER -->
      <tr><td style="padding:22px 32px 28px;border-top:1px solid #eeeeee;">
        <p style="margin:0;font-size:12px;line-height:1.7;color:#aaaaaa;text-align:center;">
          © 2026 CineaMatch · <a href="https://cineamatch.com" style="color:#999999;text-decoration:none;">cineamatch.com</a> · <a href="https://cineamatch.com/legal" style="color:#999999;text-decoration:none;">Gérer mon abonnement</a><br>
          Trouve ton film parfait avec l'IA en 30 secondes.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

// ─────────────────────────────────────────────────────────────────
//  Email « paiement échoué » (via API Brevo) — relances en cours
// ─────────────────────────────────────────────────────────────────
async function sendPaymentFailedEmail(env, userId, email, payUrl) {
    try {
        let name = '';
        try {
            const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
                headers: {
                    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
                }
            });
            if (r.ok) {
                const u = await r.json();
                name  = u?.user_metadata?.name || '';
                email = u?.email || email;
            }
        } catch (e) { /* best effort */ }

        if (!email) { console.error('sendPaymentFailedEmail: aucun email'); return; }
        const prenom = name ? ` ${name}` : '';
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': env.BREVO_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: 'CineaMatch', email: 'noreply@cineamatch.com' },
                to: [{ email, name: name || email }],
                subject: 'Action requise : ton paiement CineaMatch a échoué',
                htmlContent: paymentFailedHtml(prenom, payUrl)
            })
        });
        if (!res.ok) console.error('Brevo payment failed email error:', await res.text());
    } catch (err) {
        console.error('sendPaymentFailedEmail error:', err);
    }
}

function paymentFailedHtml(prenom, payUrl) {
    return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceef0;margin:0;padding:32px 12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
      <tr><td style="background:#0a0a0b;background-image:linear-gradient(135deg,#2a0410 0%,#0a0a0b 60%);padding:38px 32px 32px;text-align:center;">
        <span style="font-size:21px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">CINEA<span style="color:#E50914;">MATCH</span></span>
        <div style="margin:20px auto 0;width:54px;height:54px;border-radius:50%;background:rgba(255,180,77,0.16);border:1px solid rgba(255,180,77,0.5);text-align:center;line-height:54px;font-size:25px;">⚠️</div>
        <h1 style="margin:14px 0 4px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">Ton paiement n'a pas pu aboutir</h1>
        <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.6);">Rien de grave — ça se règle en 30 secondes.</p>
      </td></tr>
      <tr><td style="padding:34px 32px 8px;text-align:center;">
        <p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#444444;">
          Bonjour${prenom}, ta dernière échéance CineaMatch Premium a été refusée (carte expirée, plafond, ou solde insuffisant). <strong style="color:#111;">Ton accès reste actif pour le moment</strong>, mais mets à jour ton paiement pour ne pas le perdre.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 18px;">
          <tr><td style="border-radius:100px;background:#E50914;box-shadow:0 6px 20px rgba(229,9,20,0.4);">
            <a href="${payUrl}" target="_blank" style="display:inline-block;padding:15px 42px;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:100px;">Régulariser mon paiement →</a>
          </td></tr>
        </table>
        <p style="margin:0 0 8px;font-size:12.5px;line-height:1.6;color:#999999;">
          On réessaiera automatiquement plusieurs fois dans les prochains jours. Tu peux aussi mettre à jour ta carte directement depuis ton espace.
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid #eeeeee;">
        <p style="margin:0;font-size:12px;line-height:1.7;color:#aaaaaa;text-align:center;">
          © 2026 CineaMatch · <a href="https://cineamatch.com" style="color:#999999;text-decoration:none;">cineamatch.com</a><br>
          Trouve ton film parfait avec l'IA en 30 secondes.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
