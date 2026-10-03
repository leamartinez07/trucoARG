import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, callBid, answerBid, fold, view } from '../shared/game.ts';
import { relativeSeat, orderedSeatCards, pileDirection } from '../src/table-layout.ts';
import { gameNotice } from '../src/game-notice.ts';
import type { Player } from '../shared/game.ts';

const players = (count: number): Player[] =>
  Array.from({ length: count }, (_, seat) => ({
    id: String(seat),
    name: `Jugador ${seat}`,
    team: seat % 2,
    bot: false,
    connected: true,
  }));

test('cada carta conserva el orden y el brazo de la cruz de quien la tiró', () => {
  for (const count of [2, 4, 6]) {
    const g = createGame(players(count));
    const farSeat = count / 2;
    g.trickPlays = [0, 1, 2].map((trick) => [
      { seat: 0, card: g.original[0][trick] },
      { seat: farSeat, card: g.original[farSeat][trick] },
    ]);
    assert.deepEqual(
      orderedSeatCards(g, farSeat).map((p) => p.trick),
      [0, 1, 2],
    );
    assert.deepEqual(
      orderedSeatCards(g, 0).map((p) => p.trick),
      [0, 1, 2],
    );
    assert.equal(pileDirection(relativeSeat(farSeat, 0, count), count), 'up');
    assert.equal(pileDirection(0, count), 'down');
  }
  assert.equal(pileDirection(1, 4), 'right');
  assert.equal(pileDirection(3, 4), 'left');
  assert.equal(pileDirection(2, 6), 'up-right');
  assert.equal(pileDirection(5, 6), 'down-left');
});

test('los carteles muestran cantos y resultados, sin interrumpir cuando se acepta truco', () => {
  const g = createGame(players(2));
  assert.equal(gameNotice(view(g, 0)), null);
  callBid(g, 0, 'truco');
  assert.deepEqual(gameNotice(view(g, 1)), {
    kind: 'call', kicker: 'Jugador 0 cantó', title: '¡TRUCO!', detail: '2 puntos en juego',
  });
  answerBid(g, 1, true);
  assert.equal(gameNotice(view(g, 0)), null);
  fold(g, 0);
  assert.equal(gameNotice(view(g, 0))?.title, '+2 PUNTOS');

  const envido = createGame(players(2));
  callBid(envido, 0, 'envido');
  assert.equal(gameNotice(view(envido, 1))?.title, '¡ENVIDO!');
  answerBid(envido, 1, true);
  assert.match(gameNotice(view(envido, 0))?.title ?? '', /^\d+ TANTOS$/);
  assert.equal(gameNotice(view(envido, 0))?.detail, '+2 puntos');
});
