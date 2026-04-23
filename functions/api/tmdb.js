// Cloudflare Pages Function — proxy TMDB
// Cache la clé API TMDB côté serveur (jamais exposée au client)
// Variable à configurer : TMDB_API_KEY dans Cloudflare Pages → Settings → Environment variables

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

export async function onRequest(context) {
    const { request, env } = context;

    // Preflight CORS
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    if (request.method \!== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    const tmdbKey = env.TMDB_API_KEY;
    if (\!tmdbKey) {
        return new Response(
            JSON.stringify({ error: 'TMDB_API_KEY not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
    }

    // Extraire le chemin TMDB depuis l'URL
    // Ex: /api/tmdb?path=/movie/123/recommendations&language=fr&page=1
    const reqUrl = new URL(request.url);
    const tmdbPath = reqUrl.searchParams.get('path');

    if (\!tmdbPath) {
        return new Response(
            JSON.stringify({ error: 'Missing path parameter' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
    }

    // Reconstruire l'URL TMDB avec tous les paramètres (sauf "path")
    const tmdbParams = new URLSearchParams();
    tmdbParams.set('api_key', tmdbKey);
    for (const [k, v] of reqUrl.searchParams.entries()) {
        if (k \!== 'path') tmdbParams.set(k, v);
    }

    const tmdbUrl = `https://api.themoviedb.org/3${tmdbPath}?${tmdbParams.toString()}`;

    try {
        const tmdbResp = await fetch(tmdbUrl, {
            headers: { 'Accept': 'application/json' }
        });

        const body = await tmdbResp.text();
        return new Response(body, {
            status: tmdbResp.status,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300', // cache 5 min côté CDN
                ...CORS_HEADERS
            }
        });
    } catch (err) {
        return new Response(
            JSON.stringify({ error: 'TMDB fetch failed', detail: err.message }),
            { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
        );
    }
}
