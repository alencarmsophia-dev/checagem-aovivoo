#!/usr/bin/env node
// Painel de apuração: servidor local, sem dependências (Node 18+).
//
//   node server.js
//   abra http://localhost:3000
//
// Ele serve o public/index.html e repassa os arquivos JSON do TSE em /api/tse/
// (oficial) e /api/sim/ (simulado), os mesmos caminhos usados na Vercel. O cache de poucos segundos protege o limite de
// requisições do TSE, mesmo com várias pessoas abrindo o painel.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const UPSTREAM = {
  '/api/tse/': 'https://resultados.tse.jus.br/oficial/',
  '/api/sim/': 'https://resultados-sim.tse.jus.br/simulado/simulado2026/',
};

const TTL_OK = 10_000;   // arquivo encontrado: reaproveita por 10 s
const TTL_FAIL = 30_000; // 404 e erros: não insiste por 30 s
const cache = new Map();

function fetchCached(target) {
  const hit = cache.get(target);
  if (hit && Date.now() - hit.t < hit.ttl) return hit.p;

  const entry = { t: Date.now(), ttl: TTL_OK };
  entry.p = fetch(target, { headers: { 'user-agent': 'painel-apuracao/1.0' } })
    .then(async (r) => ({ status: r.status, body: Buffer.from(await r.arrayBuffer()) }))
    .catch(() => ({ status: 502, body: Buffer.from('{}') }))
    .then((res) => {
      entry.ttl = res.status === 200 ? TTL_OK : TTL_FAIL;
      return res;
    });
  cache.set(target, entry);
  return entry.p;
}

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');

    const prefix = Object.keys(UPSTREAM).find((p) => u.pathname.startsWith(p));
    if (prefix) {
      const rest = u.pathname.slice(prefix.length);
      if (!/^[\w\-./]+\.json$/.test(rest) || rest.includes('..')) {
        res.writeHead(400);
        return res.end('caminho inválido');
      }
      const { status, body } = await fetchCached(UPSTREAM[prefix] + rest);
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      return res.end(body);
    }

    if (u.pathname === '/' || u.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return fs.createReadStream(path.join(__dirname, 'public', 'index.html')).pipe(res);
    }

    res.writeHead(404);
    res.end('não encontrado');
  })
  .listen(PORT, () => console.log(`Painel em http://localhost:${PORT}  (teste com dados simulados: /?sim)`));
