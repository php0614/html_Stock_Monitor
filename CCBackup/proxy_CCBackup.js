/**
 * Local CORS proxy + static file server for Stock Monitor.
 *
 * Usage:
 *   node proxy.js          (default port 8081)
 *   node proxy.js 9090     (custom port)
 *
 * Open the app at:  http://127.0.0.1:8081
 *
 * In Global Settings → Proxy URL set:  http://127.0.0.1:8081
 *
 * URL convention: http://127.0.0.1:8081/<full-target-url>
 * e.g. http://127.0.0.1:8081/https://openapi.koreainvestment.com:9443/oauth2/tokenP
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { URL } = require('url');

const PORT       = parseInt(process.argv[2], 10) || 8081;
const INDEX_HTML = path.join(__dirname, 'index.html');

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

function send(res, status, body) {
  res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const raw = req.url.slice(1); // strip leading /

  // Root or /index.html → serve the HTML app
  if (raw === '' || raw === 'index.html') {
    fs.readFile(INDEX_HTML, (err, data) => {
      if (err) { send(res, 404, 'index.html not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // Proxy paths must be a full URL
  if (!raw.startsWith('http')) {
    send(res, 400, 'Not found');
    return;
  }

  let target;
  try { target = new URL(raw); }
  catch (e) { send(res, 400, 'Invalid target URL: ' + e.message); return; }

  // Forward all headers; fix host and strip hop-by-hop
  const upHeaders = Object.assign({}, req.headers);
  upHeaders['host'] = target.host;
  delete upHeaders['origin'];
  delete upHeaders['referer'];
  delete upHeaders['connection'];
  delete upHeaders['accept-encoding']; // ask upstream for plain text; we don't decompress

  const options = {
    hostname: target.hostname,
    port:     target.port || (target.protocol === 'https:' ? 443 : 80),
    path:     target.pathname + target.search,
    method:   req.method,
    headers:  upHeaders,
  };

  const proto = target.protocol === 'https:' ? https : http;
  const upReq = proto.request(options, (upRes) => {
    const outHeaders = Object.assign({}, CORS_HEADERS);
    if (upRes.headers['content-type'])
      outHeaders['content-type'] = upRes.headers['content-type'];

    const label = `[${new Date().toISOString()}] ${req.method} ${target.hostname}:${target.port || ''}${target.pathname}`;

    if (upRes.statusCode >= 400) {
      // Collect error body for diagnosis
      const chunks = [];
      upRes.on('data', c => chunks.push(c));
      upRes.on('end', () => {
        const body = Buffer.concat(chunks);
        console.log(`${label} → ${upRes.statusCode}`);
        console.log('  ↳ KIS response:', body.toString('utf8').slice(0, 400));
        console.log('  ↳ Sent headers:', JSON.stringify(options.headers, null, 2));
        res.writeHead(upRes.statusCode, outHeaders);
        res.end(body);
      });
    } else {
      console.log(`${label} → ${upRes.statusCode}`);
      res.writeHead(upRes.statusCode, outHeaders);
      upRes.pipe(res, { end: true });
    }
  });

  upReq.on('error', (err) => {
    console.error('Upstream error:', err.message);
    send(res, 502, 'Proxy upstream error: ' + err.message);
  });

  req.pipe(upReq, { end: true });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('='.repeat(55));
  console.log('  Stock Monitor — proxy + app server');
  console.log(`  Open in browser: http://127.0.0.1:${PORT}`);
  console.log('='.repeat(55));
  console.log('  In Global Settings → Proxy URL:');
  console.log(`    http://127.0.0.1:${PORT}`);
  console.log('='.repeat(55));
  console.log('  Press Ctrl+C to stop.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: node proxy.js 8082`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

process.on('uncaughtException',  (err) => console.error('Uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err));
