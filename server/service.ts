import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import { createGame, deal, playCard, callBid, answerBid, fold, view, botStep } from '../shared/game.ts';
import type { Game, Player, BidName, Card } from '../shared/game.ts';
import { update, documents } from './store.ts';
import type { Document } from './store.ts';

type Member = Player & { seen: number };
type Action = { at: number; round: number; seat: number; action: string; detail: string; message: string };
type Round = { number: number; hands: Card[][] };
type Room = { code: string; size: number; target: number; players: Member[]; game: Game | null; updated: number; public: boolean; chat: { name: string; text: string }[]; matchId: string; started: number; rounds: Round[]; actions: Action[]; botAt: number };
const random = Object.assign(() => randomInt(0x100000000) / 0x100000000, { index: (max: number) => randomInt(max) });
export function identity(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Perfil inválido. Recargá la página.');
  return createHash('sha256').update(token).digest('hex');
}
function publicView(r: Room, seat: number) {
  return { code: r.code, size: r.size, target: r.target, players: r.players.map(({ seen, ...p }) => p), game: r.game ? view(r.game, seat) : null, chat: r.chat };
}
function archive(r: Room): Document | undefined {
  if (r.game?.status !== 'finished') return;
  return { id: r.matchId, code: r.code, started: r.started, finished: Date.now(), size: r.size, target: r.target, players: r.players.map(({ seen, connected, ...p }) => p), scores: r.game.scores, winner: r.game.scores[0] >= r.target ? 0 : 1, rounds: r.rounds, actions: r.actions };
}
export async function tables() {
  return (await documents('truco_rooms')).map(d => d as unknown as Room)
    .filter(r => r.public && !r.game && r.players.length && r.players.length < r.size && Date.now() - r.updated < 120000)
    .map(r => ({ code: r.code, host: r.players[0].name, size: r.size, target: r.target, count: r.players.length }));
}
export async function history(id: string) {
  return (await documents('truco_matches')).filter(m => (m.players as Player[]).some(p => p.id === id)).sort((a,b) => Number(b.finished) - Number(a.finished));
}
export async function command(id: string, data: Record<string, unknown>) {
  const action = String(data.action);
  if (action === 'history') return { ok: true, id, matches: await history(id) };
  const creating = action === 'create';
  const code = creating ? randomBytes(5).toString('hex').slice(0,6).toUpperCase() : String(data.code ?? '').trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) throw Error('Código de mesa inválido.');
  return update<Record<string,unknown>>(code, document => {
    const now = Date.now();
    let r = document as unknown as Room | null;
    if (creating) {
      if (r) throw Error('No se pudo crear la mesa. Volvé a intentar.');
      const size = Number(data.size), target = Number(data.target);
      if (![2,4,6].includes(size) || ![15,30].includes(target)) throw Error('Configuración inválida.');
      r = { code, size, target, players: [], game: null, updated: now, public: data.public === true, chat: [], matchId: randomUUID(), started: 0, rounds: [], actions: [], botAt: now };
    }
    if (!r || now - r.updated > 12 * 60 * 60 * 1000) throw Error('La mesa ya no está disponible.');
    let seat = r.players.findIndex(p => p.id === id);
    if (creating || action === 'join') {
      const name = String(data.name ?? '').trim().slice(0,20);
      if (!name) throw Error('Ingresá tu nombre.');
      if (seat < 0) {
        if (r.game || r.players.length >= r.size) throw Error('Esta mesa ya está jugando o está llena.');
        seat = r.players.length;
        r.players.push({ id, name, team: seat % 2, bot: false, connected: true, seen: now });
      }
    }
    if (seat < 0) throw Error('No estás en esta mesa.');
    r.players[seat].seen = now;
    r.players.forEach(p => p.connected = p.bot || now - p.seen < 20000);
    // JSON persistence loses shared object references; restore the authoritative members.
    if (r.game) r.game.players = r.players;
    if (action === 'leave') {
      if (r.game) { r.players[seat].connected = false; r.players[seat].seen = 0; }
      else { r.players.splice(seat,1); r.players.forEach((p,i) => p.team = i % 2); }
      r.updated = now;
      return { state: r as unknown as Document, result: { ok: true, id, room: null } };
    }
    if (action === 'chat') {
      const text = String(data.text ?? '').trim().slice(0,180);
      if (text) r.chat = [...r.chat.slice(-39), { name: r.players[seat].name, text }];
    } else if (action === 'start') {
      if (seat !== 0 || r.game) throw Error('Sólo quien creó la mesa puede repartir.');
      if (data.bots === true) while (r.players.length < r.size) r.players.push({ id: `bot-${r.players.length}`, name: ['Tito','La Negra','Rolo','Luli','Cacho'][r.players.length - 1], team: r.players.length % 2, bot: true, connected: true, seen: now });
      if (r.players.length !== r.size) throw Error('Faltan jugadores.');
      r.game = createGame(r.players, r.target, random);
      r.started = now;
      r.rounds.push({ number: r.game.round, hands: structuredClone(r.game.original) });
    } else if (!['create','join','resume','poll'].includes(action)) {
      const g = r.game;
      if (!g) throw Error('Todavía no se repartió.');
      if (r.players.some(p => !p.connected)) throw Error('Esperamos a quien se desconectó.');
      if (action === 'play') playCard(g, seat, String(data.card));
      else if (action === 'bid') callBid(g, seat, String(data.name) as BidName);
      else if (action === 'answer') answerBid(g, seat, data.accept === true);
      else if (action === 'fold') fold(g, seat);
      else if (action === 'next') {
        if (seat !== 0 || g.status !== 'round-end') throw Error('Esperá a que termine la mano.');
        deal(g,random);
        r.rounds.push({ number: g.round, hands: structuredClone(g.original) });
      } else throw Error('Acción desconocida.');
      r.actions.push({ at: now, round: g.round, seat, action, detail: String(data.card ?? data.name ?? (action === 'answer' ? (data.accept ? 'quiero' : 'no quiero') : '')), message: g.message });
    }
    if (action === 'poll' && r.game && now - r.botAt >= 900 && r.players.every(p => p.connected)) {
      const before = structuredClone(r.game);
      if (botStep(r.game,random)) {
        r.actions.push({ at: now, round: r.game.round, seat: before.bid ? r.players.findIndex(p => p.bot && p.team !== before.bid!.team) : before.turn, action: before.bid ? 'answer' : 'play', detail: before.bid ? r.game.message : r.game.table.find(p => p.seat === before.turn)?.card.id || '', message: r.game.message });
        r.botAt = now;
      }
    }
    r.updated = now;
    return { state: r as unknown as Document, archive: archive(r), result: { ok: true, id, code, token: 'profile', room: publicView(r,seat) } };
  });
}
