// Repassa um arquivo JSON do TSE. O cache fica na borda da Vercel (s-maxage),
// então muita gente abrindo o painel gera poucas requisições ao TSE.
module.exports = function makeProxy(upstream) {
  return async function handler(req, res) {
    const rest = [].concat(req.query.path || []).join('/');
    if (!/^[\w\-./]+\.json$/.test(rest) || rest.includes('..')) {
      res.status(400).send('caminho inválido');
      return;
    }
    res.setHeader('content-type', 'application/json; charset=utf-8');
    try {
      const r = await fetch(upstream + rest, { headers: { 'user-agent': 'painel-apuracao/1.0' } });
      const body = Buffer.from(await r.arrayBuffer());
      res.setHeader('cache-control', r.status === 200 ? 's-maxage=10, stale-while-revalidate=20' : 's-maxage=30');
      res.status(r.status).send(body);
    } catch (e) {
      res.setHeader('cache-control', 's-maxage=5');
      res.status(502).send('{}');
    }
  };
};
