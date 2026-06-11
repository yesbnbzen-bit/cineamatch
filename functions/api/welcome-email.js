// ─────────────────────────────────────────────────────────────────
//  Endpoint désactivé.
//  L'email de bienvenue « membre Premium » est désormais envoyé côté serveur
//  par le webhook Stripe (functions/api/stripe-webhook.js), uniquement après un
//  paiement réussi et vérifié par signature. On ne laisse donc PAS d'endpoint
//  public d'envoi d'email (sinon abus/spam possible).
// ─────────────────────────────────────────────────────────────────
export async function onRequest() {
    return new Response('Not Found', { status: 404 });
}
