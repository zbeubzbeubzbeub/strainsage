export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    // ── ROUTE /gst : catalogue du grossiste Garden Seeds Trading (lecture seule) ──
    // Liste blanche stricte : /articulos, /articulos/{codigo}, /familias, /grupos.
    // Tout le reste est refusé, en particulier /pedidos et /subclientes : aucune commande ne peut partir de l'app.
    // Le jeton Garden Seeds vient du secret GST_TOKEN et n'est jamais renvoyé au navigateur.
    if (url.pathname === '/gst' || url.pathname.startsWith('/gst/')) {
      const json = { ...cors, 'Content-Type': 'application/json' };
      if (shopToken !== VALID_TOKEN) {
        return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: json });
      }
      if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Méthode non autorisée (lecture seule)' }), { status: 405, headers: json });
      }
      if (!env.GST_TOKEN) {
        return new Response(JSON.stringify({ error: 'Secret GST_TOKEN absent du Worker' }), { status: 500, headers: json });
      }
      const sub = url.pathname.slice(4).replace(/^\/+|\/+$/g, '');
      const allowed = /^(articulos|familias|grupos)$/.test(sub) || /^articulos\/[A-Za-z0-9._-]{1,64}$/.test(sub);
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Route Garden Seeds non autorisée' }), { status: 403, headers: json });
      }
      const params = new URLSearchParams();
      for (const k of ['idFamilia', 'per_page', 'page', 'sort_by']) {
        const v = url.searchParams.get(k);
        if (v !== null && /^[A-Za-z0-9_.-]{1,40}$/.test(v)) params.set(k, v);
      }
      try {
        const target = 'https://api.gardenseedstrading.com/v1/' + sub + (params.toString() ? '?' + params.toString() : '');
        const res = await fetch(target, { headers: { 'Authorization': 'Bearer ' + env.GST_TOKEN, 'Accept': 'application/json' } });
        const body = await res.text();
        // le vrai statut de Garden Seeds est renvoyé tel quel (pas de 200 trompeur)
        return new Response(body, { status: res.status, headers: json });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Garden Seeds injoignable : ' + err.message }), { status: 502, headers: json });
      }
    }

    // ── ROUTE /image : proxy d'images pour contourner CORS ──
    if (url.pathname === '/image') {
      try {
        const imgUrl = url.searchParams.get('url');
        if (!imgUrl) return new Response('url manquant', { status: 400, headers: cors });
        // Sécurité : seulement les domaines autorisés
        const allowed = ['leafly.com', 'seedfinder.eu', 'royalqueenseeds.com', 'barneysfarm.com', 'dutch-passion.com', '2fast4buds.com'];
        const imgDomain = new URL(imgUrl).hostname;
        if (!allowed.some(d => imgDomain.endsWith(d))) {
          return new Response('Domaine non autorisé', { status: 403, headers: cors });
        }
        const imgRes = await fetch(imgUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': imgDomain }
        });
        if (!imgRes.ok) return new Response('Image non trouvée', { status: 404, headers: cors });
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        return new Response(imgRes.body, {
          status: 200,
          headers: {
            ...cors,
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400'
          }
        });
      } catch (err) {
        return new Response('Erreur: ' + err.message, { status: 500, headers: cors });
      }
    }


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
