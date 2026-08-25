#!/usr/bin/env node
/**
 * VELDA — publikacja na X (OAuth 1.0a, user context).
 * Bez zależności: podpis HMAC-SHA1 liczony z node:crypto.
 * X API v2, endpoint POST /2/tweets — działa na darmowym planie (limit zapisu ~500/mies).
 *
 * Klucze przychodzą ze środowiska (GitHub Secrets), nigdy z pliku:
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
 */
import { createHmac, randomBytes } from 'node:crypto';

const ENDPOINT = 'https://api.x.com/2/tweets';

// RFC 3986 — X odrzuca podpis, jeśli ! * ' ( ) nie są zakodowane.
const enc = s => encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function authHeader({ key, secret, token, tokenSecret }){
  const params = {
    oauth_consumer_key: key,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  // Body JSON-owe NIE wchodzi do podpisu — tylko parametry oauth_* (brak query stringa).
  const base = [
    'POST',
    enc(ENDPOINT),
    enc(Object.keys(params).sort().map(k => `${enc(k)}=${enc(params[k])}`).join('&')),
  ].join('&');

  const signingKey = `${enc(secret)}&${enc(tokenSecret)}`;
  params.oauth_signature = createHmac('sha1', signingKey).update(base).digest('base64');

  return 'OAuth ' + Object.keys(params).sort()
    .map(k => `${enc(k)}="${enc(params[k])}"`).join(', ');
}

/** Publikuje post. Zwraca { id, text }. Rzuca z treścią błędu X, jeśli się nie uda. */
export async function postToX(text){
  const creds = {
    key:         process.env.X_API_KEY,
    secret:      process.env.X_API_SECRET,
    token:       process.env.X_ACCESS_TOKEN,
    tokenSecret: process.env.X_ACCESS_SECRET,
  };
  const missing = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Brak kluczy X w środowisku: ${missing.join(', ')}`);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: authHeader(creds),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30000),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`X API ${res.status}: ${raw}`);
  return JSON.parse(raw).data;
}
