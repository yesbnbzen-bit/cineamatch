// Cloudflare Pages Function — proxy OpenAI
// Clé lue côté serveur via env var Cloudflare (jamais exposée au client)
// Variable à configurer : OPENAI_API_KEY dans Cloudflare Pages → Settings → Environment variables

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MODEL_FALLBACKS = [
    'gpt-4o-mini',
    'gpt-4.1-mini',
    'gpt-4o',
    'gpt-3.5-turbo'
];

export async function onRequest(context) {
    const { request, env } = context;

    // Preflight CORS
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const serverKey = env.OPENAI_API_KEY || '';
    const clientAuth = request.headers.get('Authorization') || '';
    const authHeader = serverKey ? `Bearer ${serverKey}` : clientAuth;

    if (!authHeader) {
        return new Response(
            JSON.stringify({ error: { message: 'No API key configured' } }),
            { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
    }

    let parsedBody;
    try {
        parsedBody = await request.json();
    } catch(e) {
        return new Response(
            JSON.stringify({ error: { message: 'Invalid request body' } }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
    }

    for (const model of MODEL_FALLBACKS) {
        try {
            parsedBody.model = model;
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify(parsedBody)
            });

            if (response.status === 404 || response.status === 403) continue;

            if (response.status === 400) {
                const errText = await response.text();
                if (errText.includes('model') || errText.includes('Model')) continue;
                return new Response(errText, {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
                });
            }

            const text = await response.text();
            return new Response(text, {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Model-Used': model,
                    ...CORS_HEADERS
                }
            });
        } catch(fetchErr) {
            continue;
        }
    }

    return new Response(
        JSON.stringify({ error: { message: 'Tous les modèles OpenAI disponibles ont échoué.' } }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
}
