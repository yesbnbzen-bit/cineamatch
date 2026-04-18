// Netlify serverless function — proxy OpenAI
// Clé lue côté serveur via env var Netlify (jamais exposée au client)
exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Priorité : env var serveur Netlify (OPENAI_API_KEY) > header client
    // ⚠️ Configurer OPENAI_API_KEY dans Netlify → Site settings → Environment variables
    const serverKey = process.env.OPENAI_API_KEY || '';
    const clientAuth = event.headers['authorization'] || event.headers['Authorization'] || '';
    const authHeader = serverKey ? `Bearer ${serverKey}` : clientAuth;

    if (!authHeader) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: { message: 'No API key configured' } })
        };
    }

    // Modèles dans l'ordre de préférence — auto-fallback si 404/403/429
    const MODEL_FALLBACKS = [
        'gpt-4o-mini',
        'gpt-4.1-mini',
        'gpt-4o',
        'gpt-3.5-turbo'
    ];

    let parsedBody;
    try {
        parsedBody = JSON.parse(event.body);
    } catch(e) {
        // Body invalide
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: { message: 'Invalid request body' } })
        };
    }

    // Forcer le modèle courant (priorité 1 : liste fallbacks, priorité 2 : ce que le client demande)
    const modelsToTry = [MODEL_FALLBACKS[0], ...MODEL_FALLBACKS.slice(1)];

    for (const model of modelsToTry) {
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

            // Si 404/403/400 model-related, essayer le modèle suivant
            if (response.status === 404 || response.status === 403) continue;
            // Si 400 avec erreur de modèle spécifique, essayer le suivant
            if (response.status === 400) {
                const errText = await response.text();
                if (errText.includes('model') || errText.includes('Model')) continue;
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                    body: errText
                };
            }

            const text = await response.text();
            return {
                statusCode: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'X-Model-Used': model
                },
                body: text
            };
        } catch(fetchErr) {
            // Erreur réseau sur ce modèle — essayer le suivant
            continue;
        }
    }

    // Tous les modèles ont échoué
    return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: 'Tous les modèles OpenAI disponibles ont échoué (404). Vérifie ta clé API.' } })
    };
};
