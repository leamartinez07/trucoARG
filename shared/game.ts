import { secureRandom } from './random.ts';
import type { Random } from './random.ts';
export type Suit = 'espadas' | 'bastos' | 'oros' | 'copas';
export type Card = { id: string; suit: Suit; value: number };
export type Player = { id: string; name: string; team: number; bot: boolean; connected: boolean };
export type BidName =
  'envido' | 'real envido' | 'falta envido' | 'truco' | 'retruco' | 'vale cuatro';
export type Bid = {
  name: BidName;
  team: number;
  points: number;
  refused: number;
  kind: 'envido' | 'truco';
  envidos: number;
};
export type Play = { seat: number; card: Card };
export type Game = {
  players: Player[];
  hands: Card[][];
  original: Card[][];
  scores: number[];
  target: number;
  mano: number;
  turn: number;
  trickLeader: number;
  plays: Play[];
  table: Play[];
  tricks: (number | null)[];
  stake: number;
  raiseTeam: number | null;
  bid: Bid | null;
  suspended: Bid | null;
  envidoDone: boolean;
  round: number;
  status: 'playing' | 'round-end' | 'finished';
  log: string[];
  message: string;
};
export type View = Omit<Game, 'hands' | 'original'> & {
  hand: Card[];
  remaining: number[];
  seat: number;
  envidoPoints: number;
};
export const suits: Suit[] = ['espadas', 'bastos', 'oros', 'copas'];
export const deck = (): Card[] =>
  suits.flatMap((suit) =>
    [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((value) => ({ id: `${suit}-${value}`, suit, value })),
  );
export function rank(c: Card): number {
  if (c.value === 1 && c.suit === 'espadas') return 14;
  if (c.value === 1 && c.suit === 'bastos') return 13;
  if (c.value === 7 && c.suit === 'espadas') return 12;
  if (c.value === 7 && c.suit === 'oros') return 11;
  return (
    { 3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1 } as Record<number, number>
  )[c.value];
}
export function envido(cards: Card[]): number {
  let best = Math.max(...cards.map((c) => (c.value < 10 ? c.value : 0)));
  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++)
      if (cards[i].suit === cards[j].suit)
        best = Math.max(
          best,
          20 +
            (cards[i].value < 10 ? cards[i].value : 0) +
            (cards[j].value < 10 ? cards[j].value : 0),
        );
  return best;
}
export function roundWinner(tricks: (number | null)[], manoTeam: number): number | null {
  const [a, b, c] = tricks;
  if (tricks.length >= 2) {
    if (a !== null && (a === b || b === null)) return a;
    if (a === null && b !== null) return b;
  }
  if (tricks.length === 3) return c ?? a ?? b ?? manoTeam;
  return null;
}
export function createGame(
  players: Player[],
  target = 30,
  random: Random = secureRandom,
): Game {
  const g: Game = {
    players,
    hands: [],
    original: [],
    scores: [0, 0],
    target,
    mano: 0,
    turn: 0,
    trickLeader: 0,
    plays: [],
    table: [],
    tricks: [],
    stake: 1,
    raiseTeam: null,
    bid: null,
    suspended: null,
    envidoDone: false,
    round: 0,
    status: 'playing',
    log: [],
    message: '',
  };
  deal(g, random, false);
  return g;
}
export function deal(g: Game, random: Random = secureRandom, rotate = true) {
  if (g.status === 'finished') return;
  if (rotate) g.mano = (g.mano + 1) % g.players.length;
  const cards = deck();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = random.index ? random.index(i + 1) : Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  g.hands = g.players.map(() => cards.splice(0, 3));
  g.original = g.hands.map((h) => [...h]);
  Object.assign(g, {
    turn: g.mano,
    trickLeader: g.mano,
    plays: [],
    table: [],
    tricks: [],
    stake: 1,
    raiseTeam: null,
    bid: null,
    suspended: null,
    envidoDone: false,
    status: 'playing',
    round: g.round + 1,
    message: `Repartimos. ${g.players[g.mano].name} es mano.`,
  });
  addLog(g, g.message);
}
function addLog(g: Game, message: string) {
  g.log = [...g.log.slice(-29), message];
}
function score(g: Game, team: number, points: number) {
  g.scores[team] += points;
  if (g.scores[team] >= g.target) {
    g.status = 'finished';
    g.bid = null;
    g.suspended = null;
    g.message = `¡Ganó ${team === 0 ? 'Nosotros' : 'Ellos'}!`;
  }
}
function finishRound(g: Game, team: number, points = g.stake) {
  g.status = 'round-end';
  g.message = `Equipo ${team === 0 ? 'celeste' : 'crema'} gana la mano. +${points} ${points === 1 ? 'punto' : 'puntos'}.`;
  addLog(g, g.message);
  score(g, team, points);
}
export function playCard(g: Game, seat: number, id: string) {
  if (g.status !== 'playing' || g.bid || g.turn !== seat)
    throw Error('Esperá tu turno para tirar.');
  const index = g.hands[seat].findIndex((c) => c.id === id);
  if (index < 0) throw Error('Esa carta no está en tu mano.');
  const [card] = g.hands[seat].splice(index, 1);
  const play = { seat, card };
  g.plays.push(play);
  g.table = [...g.plays];
  addLog(g, `${g.players[seat].name} tiró ${card.value} de ${card.suit}.`);
  if (g.plays.length < g.players.length) {
    g.turn = (seat + 1) % g.players.length;
    return;
  }
  const high = Math.max(...g.plays.map((p) => rank(p.card)));
  const best = g.plays.filter((p) => rank(p.card) === high);
  const teams = new Set(best.map((p) => g.players[p.seat].team));
  const winner = teams.size === 1 ? g.players[best[0].seat].team : null;
  g.tricks.push(winner);
  const result = roundWinner(g.tricks, g.players[g.mano].team);
  if (result !== null) {
    finishRound(g, result);
    return;
  }
  const leader = winner === null ? g.trickLeader : best[0].seat;
  g.turn = leader;
  g.trickLeader = leader;
  g.plays = [];
  g.message =
    winner === null ? 'Parda. Seguimos.' : `${g.players[best[0].seat].name} ganó la baza.`;
}
export function canEnvido(g: Game, seat: number) {
  return !g.envidoDone && g.tricks.length === 0 && g.hands[seat].length === 3;
}
export function callBid(g: Game, seat: number, name: BidName) {
  if (g.status !== 'playing') throw Error('La mano terminó.');
  const team = g.players[seat].team;
  const kind = name.includes('envido') ? 'envido' : 'truco';
  const old = g.bid;
  if (old?.team === team) throw Error('Tiene que responder el otro equipo.');
  if (kind === 'envido') {
    if (!canEnvido(g, seat)) throw Error('El envido se canta antes de tirar tu primera carta.');
    if (old?.kind === 'truco') {
      if (old.name !== 'truco') throw Error('El envido ya pasó.');
      g.suspended = old;
    }
    if (
      old?.kind === 'envido' &&
      (old.name === 'falta envido' ||
        (name === 'envido' && (old.name !== 'envido' || old.envidos >= 2)) ||
        (name === 'real envido' && old.name === 'real envido'))
    )
      throw Error('Ese canto no puede subir la apuesta.');
    const previous = old?.kind === 'envido' ? old : null;
    const points =
      name === 'falta envido'
        ? Math.max(...g.scores) < g.target / 2
          ? g.target - Math.min(...g.scores)
          : g.target - Math.max(...g.scores)
        : (previous?.points ?? 0) + (name === 'envido' ? 2 : 3);
    g.bid = {
      name,
      team,
      points,
      refused: previous?.points ?? 1,
      kind,
      envidos: (previous?.envidos ?? 0) + (name === 'envido' ? 1 : 0),
    };
  } else {
    if (old?.kind === 'envido') throw Error('Primero hay que responder al envido.');
    const points = ({ truco: 2, retruco: 3, 'vale cuatro': 4 } as Record<string, number>)[name];
    if (
      points !== (old?.points ?? g.stake) + 1 ||
      (!old && g.raiseTeam !== null && g.raiseTeam !== team)
    )
      throw Error('No podés cantar eso ahora.');
    g.bid = { name, team, points, refused: old?.points ?? g.stake, kind, envidos: 0 };
  }
  g.message = `${g.players[seat].name}: ¡${name}!`;
  addLog(g, g.message);
}
export function answerBid(g: Game, seat: number, accept: boolean) {
  const bid = g.bid;
  if (g.status !== 'playing' || !bid || bid.team === g.players[seat].team)
    throw Error('No hay un canto para responder.');
  g.bid = null;
  addLog(g, `${g.players[seat].name}: ${accept ? '¡Quiero!' : 'No quiero.'}`);
  if (bid.kind === 'truco') {
    g.envidoDone = true;
    if (accept) {
      g.stake = bid.points;
      g.raiseTeam = g.players[seat].team;
      g.message = `Truco querido. Jugamos por ${g.stake}.`;
    } else finishRound(g, bid.team, bid.refused);
  } else {
    g.envidoDone = true;
    let winner = bid.team;
    let best = -1;
    let winningSeat = g.mano;
    if (accept)
      for (let i = 0; i < g.players.length; i++) {
        const s = (g.mano + i) % g.players.length;
        const value = envido(g.original[s]);
        if (value > best) {
          best = value;
          winner = g.players[s].team;
          winningSeat = s;
        }
      }
    const points = accept ? bid.points : bid.refused;
    g.message = accept
      ? `${g.players[winningSeat].name} tiene ${best}. +${points} de envido.`
      : `Envido no querido. +${points}.`;
    addLog(g, g.message);
    score(g, winner, points);
    if (g.status === 'playing') {
      g.bid = g.suspended;
      g.suspended = null;
    }
  }
}
export function fold(g: Game, seat: number) {
  if (g.status !== 'playing' || g.bid) throw Error('Respondé al canto primero.');
  finishRound(g, 1 - g.players[seat].team);
}
export function view(g: Game, seat: number): View {
  const { hands, original, ...publicGame } = g;
  return {
    ...publicGame,
    hand: hands[seat] ?? [],
    remaining: hands.map((h) => h.length),
    seat,
    envidoPoints: envido(original[seat] ?? []),
  };
}
export function botStep(g: Game, random: Random = secureRandom) {
  if (g.status !== 'playing') return false;
  if (g.bid) {
    const seat = g.players.findIndex((p) => p.bot && p.team !== g.bid!.team);
    if (seat < 0) return false;
    answerBid(
      g,
      seat,
      g.bid.kind === 'envido'
        ? envido(g.original[seat]) >= 25 || random() > 0.55
        : Math.max(...g.hands[seat].map(rank), 0) >= 9 || random() > 0.4,
    );
    return true;
  }
  const seat = g.turn;
  if (!g.players[seat].bot) return false;
  const sorted = [...g.hands[seat]].sort((a, b) => rank(a) - rank(b));
  const high = Math.max(
    ...g.plays
      .filter((p) => g.players[p.seat].team !== g.players[seat].team)
      .map((p) => rank(p.card)),
    0,
  );
  playCard(g, seat, (sorted.find((c) => rank(c) > high) ?? sorted[0]).id);
  return true;
}
