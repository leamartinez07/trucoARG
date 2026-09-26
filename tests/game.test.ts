import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deck,
  rank,
  envido,
  roundWinner,
  createGame,
  playCard,
  callBid,
  answerBid,
  view,
  deal,
  botStep,
} from '../shared/game.ts';
import type { Card, Player } from '../shared/game.ts';
const c = (suit: Card['suit'], value: number): Card => ({ suit, value, id: `${suit}-${value}` });
const players = (size = 2): Player[] =>
  Array.from({ length: size }, (_, i) => ({
    id: String(i),
    name: `Jugador ${i}`,
    team: i % 2,
    bot: false,
    connected: true,
  }));
test('baraja de 40, sin ochos ni nueves, jerarquía argentina', () => {
  const d = deck();
  assert.equal(d.length, 40);
  assert.equal(new Set(d.map((c) => c.id)).size, 40);
  assert.ok(d.every((c) => c.value !== 8 && c.value !== 9));
  assert.ok(rank(c('espadas', 1)) > rank(c('bastos', 1)));
  assert.ok(rank(c('bastos', 1)) > rank(c('espadas', 7)));
  assert.ok(rank(c('oros', 7)) > rank(c('copas', 3)));
  assert.equal(rank(c('oros', 3)), rank(c('espadas', 3)));
});
test('envido suma los mejores dos del palo y figuras valen cero', () => {
  assert.equal(envido([c('espadas', 7), c('espadas', 6), c('copas', 3)]), 33);
  assert.equal(envido([c('oros', 12), c('oros', 11), c('copas', 4)]), 20);
  assert.equal(envido([c('espadas', 7), c('copas', 6), c('oros', 4)]), 7);
  assert.equal(envido([c('oros', 7), c('oros', 6), c('oros', 5)]), 33);
});
test('pardas favorecen primera ganada y triple parda a mano', () => {
  assert.equal(roundWinner([0, null], 1), 0);
  assert.equal(roundWinner([null, 1], 0), 1);
  assert.equal(roundWinner([0, 1, null], 1), 0);
  assert.equal(roundWinner([null, null, null], 1), 1);
  assert.equal(roundWinner([null, null, 0], 1), 0);
  assert.equal(roundWinner([0, 1], 0), null);
});
test('repartir 2, 4 y 6 no duplica cartas ni filtra manos ajenas', () => {
  for (const size of [2, 4, 6]) {
    const g = createGame(players(size));
    assert.equal(new Set(g.hands.flat().map((c) => c.id)).size, size * 3);
    const v = view(g, 0);
    assert.equal(v.hand.length, 3);
    assert.equal('hands' in v, false);
    assert.equal('original' in v, false);
    assert.equal(v.envidoPoints, envido(g.original[0]));
  }
});
test('servidor rechaza jugar fuera de turno o cartas ajenas', () => {
  const g = createGame(players());
  assert.throws(() => playCard(g, 1, g.hands[1][0].id));
  assert.throws(() => playCard(g, 0, g.hands[1][0].id));
  playCard(g, 0, g.hands[0][0].id);
  assert.equal(g.turn, 1);
});
test('envido igualado lo gana la mano y no termina el truco', () => {
  const g = createGame(players());
  g.original = [
    [c('espadas', 7), c('espadas', 6), c('copas', 4)],
    [c('oros', 7), c('oros', 6), c('bastos', 5)],
  ];
  callBid(g, 1, 'envido');
  answerBid(g, 0, true);
  assert.deepEqual(g.scores, [2, 0]);
  assert.equal(g.status, 'playing');
  assert.equal(g.envidoDone, true);
});
test('envido tiene prioridad sobre truco pendiente', () => {
  const g = createGame(players());
  callBid(g, 0, 'truco');
  callBid(g, 1, 'envido');
  assert.equal(g.bid?.kind, 'envido');
  answerBid(g, 0, false);
  assert.equal(g.bid?.name, 'truco');
  answerBid(g, 1, true);
  assert.equal(g.stake, 2);
  assert.equal(g.raiseTeam, 1);
});
test('subir y rechazar retruco otorga dos puntos', () => {
  const g = createGame(players());
  callBid(g, 0, 'truco');
  assert.throws(() => playCard(g, 0, g.hands[0][0].id));
  answerBid(g, 1, true);
  assert.throws(() => callBid(g, 0, 'retruco'));
  callBid(g, 1, 'retruco');
  answerBid(g, 0, false);
  assert.deepEqual(g.scores, [0, 2]);
  assert.equal(g.status, 'round-end');
});
test('envido envido real acumula, no permite bajar la apuesta', () => {
  const g = createGame(players());
  callBid(g, 0, 'envido');
  callBid(g, 1, 'envido');
  assert.equal(g.bid?.points, 4);
  assert.throws(() => callBid(g, 0, 'envido'));
  callBid(g, 0, 'real envido');
  assert.equal(g.bid?.points, 7);
  answerBid(g, 1, false);
  assert.deepEqual(g.scores, [4, 0]);
});
test('bots completan partidas de todos los tamaños sin bloquear el motor', () => {
  for (const size of [2, 4, 6]) {
    const p = players(size).map((p) => ({ ...p, bot: true }));
    const g = createGame(p, 15);
    let actions = 0;
    while (g.status !== 'finished' && actions < 1000) {
      if (g.status === 'round-end') deal(g);
      else assert.ok(botStep(g));
      actions++;
    }
    assert.equal(g.status, 'finished');
    assert.ok(Math.max(...g.scores) >= 15);
  }
});
