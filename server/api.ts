import type { IncomingMessage, ServerResponse } from 'node:http';
import { command, identity, tables } from './service.ts';
export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try {
    if (req.method === 'GET') { res.end(JSON.stringify({ ok: true, tables: await tables() })); return; }
    if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ ok:false,error:'Método inválido.' })); return; }
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) throw Error('Origen inválido.');
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /,'');
    const id = identity(token);
    let body = req.body;
    if (!body) {
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 4096) throw Error('Solicitud demasiado grande.'); }
      body = JSON.parse(text);
    } else if (typeof body === 'string') body = JSON.parse(body);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Solicitud inválida.');
    res.end(JSON.stringify(await command(id,body as Record<string,unknown>)));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar.';
    const expected = /mesa|jugador|perfil|turno|carta|mano|canto|nombre|repart|Esper|Sólo|Origen|Código|equipo|Acción|Configuración|Respond|Truco|envido/i.test(message);
    if (!expected) console.error('API:', error);
    res.statusCode = expected ? 400 : 503;
    res.end(JSON.stringify({ ok:false,error:expected ? message : 'El servidor no está disponible. Intentá en un momento.' }));
  }
}
