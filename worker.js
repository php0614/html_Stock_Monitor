/**
 * Cloudflare Worker — CORS proxy for Stock Monitor
 *
 * Deploy once; set the worker URL as Proxy URL in the app's Global Settings.
 * URL convention: https://your-worker.workers.dev/<full-target-url>
 *
 * Free tier: 100,000 requests/day — more than enough for personal use.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': [
    'Content-Type', 'Authorization', 'appkey', 'appsecret',
    'tr_id', 'tr_cont', 'custtype', 'seq_no', 'mac_address',
    'phone_number', 'ip_addr', 'hashkey', 'gt_uid',
  ].join(', '),
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url   = new URL(request.url);
    const raw   = url.pathname.slice(1) + url.search; // strip leading /

    if (!raw) {
      return new Response(
        'Stock Monitor CORS Proxy is running.\nSet this URL as Proxy URL in the app.',
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' } }
      );
    }

    if (!raw.startsWith('http')) {
      return new Response('Proxy: path must be a full URL starting with http(s)://', {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      });
    }

    // Strip Cloudflare-injected and browser-origin headers before forwarding
    const upHeaders = new Headers(request.headers);
    for (const h of ['origin','referer','cf-connecting-ip','cf-ipcountry',
                     'cf-ray','cf-visitor','x-forwarded-for','x-forwarded-proto','x-real-ip']) {
      upHeaders.delete(h);
    }

    const upRequest = new Request(raw, {
      method:  request.method,
      headers: upHeaders,
      body:    ['GET','HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    });

    let upResponse;
    try {
      upResponse = await fetch(upRequest);
    } catch (e) {
      return new Response('Proxy upstream error: ' + e.message, {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      });
    }

    const outHeaders = new Headers(CORS_HEADERS);
    const ct = upResponse.headers.get('content-type');
    if (ct) outHeaders.set('content-type', ct);

    return new Response(upResponse.body, {
      status:  upResponse.status,
      headers: outHeaders,
    });
  },
};
