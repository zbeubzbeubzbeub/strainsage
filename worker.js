export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Token',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    // ── Vérification token shop pour les routes /search et /fetch-page ──
    const VALID_TOKEN = env.SHOP_TOKEN || 'strainsage-secret';
    const shopToken = request.headers.get('X-Shop-Token');

    // ── ROUTE /search : recherche web via Jina ──
    if (url.pathname === '/search') {
      if (shopToken !== VALID_TOKEN) {
        return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: cors });
      }
      try {
        const body = await request.json();
        const query = body.query;
        if (!query) return new Response(JSON.stringify({ error: 'query manquant' }), { status: 400, headers: cors });

        // Jina Search — retourne les top résultats web en texte
        const jinaRes = await fetch('https://s.jina.ai/' + encodeURIComponent(query), {
          headers: {
            'Accept': 'application/json',
            'X-Return-Format': 'text',
            'X-With-Links-Summary': 'true'
          }
        });
        const jinaText = await jinaRes.text();

        return new Response(JSON.stringify({ result: jinaText.slice(0, 8000) }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── ROUTE /fetch-page : lire une page spécifique via Jina Reader ──
    if (url.pathname === '/fetch-page') {
      if (shopToken !== VALID_TOKEN) {
        return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: cors });
      }
      try {
        const body = await request.json();
        const pageUrl = body.url;
        if (!pageUrl) return new Response(JSON.stringify({ error: 'url manquant' }), { status: 400, headers: cors });

        const jinaRes = await fetch('https://r.jina.ai/' + pageUrl, {
          headers: {
            'Accept': 'application/json',
            'X-Return-Format': 'text',
            'X-With-Images-Summary': 'true'
          }
        });
        const jinaText = await jinaRes.text();

        return new Response(JSON.stringify({ result: jinaText.slice(0, 8000) }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── ROUTE / : proxy API Anthropic (streaming + non-streaming) ──
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: { message: 'Clé API non configurée.' } }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    try {
      const bodyText = await request.text();
      const bodyJson = JSON.parse(bodyText);
      const isStream = bodyJson.stream === true;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: bodyText
      });

      if (isStream) {
        // Transmettre le stream SSE directement au client
        return new Response(response.body, {
          status: response.status,
          headers: {
            ...cors,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
          }
        });
      } else {
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: { message: err.message } }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }
};
