import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, view, callBid, answerBid } from '../shared/game.ts';
import { presentationFrames, ANSWER_PAUSE, RESULT_PAUSE } from '../src/game-presentation.ts';

for (const bots of [false, true]) test(`respuesta antes del resultado y puntaje, bots=${bots}`, () => {
  const game = createGame([0,1].map(i => ({ id:String(i), name:`Jugador ${i}`, team:i, bot:bots, connected:true })));
  callBid(game, 0, 'envido');
  const previous = structuredClone(view(game, 0));
  answerBid(game, 1, true);
  const next = structuredClone(view(game, 0));
  const frames = presentationFrames(previous, next);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].duration, ANSWER_PAUSE);
  assert.match(frames[0].game.message, /Quiero/);
  assert.deepEqual(frames[0].game.scores, previous.scores);
  assert.equal(frames[0].game.log.some(line => line.includes(' de envido.')), false);
  assert.equal(frames[1].duration, RESULT_PAUSE);
  assert.deepEqual(frames[1].game.scores, next.scores);
  assert.equal(presentationFrames(next, structuredClone(next))[0].duration, 0, 'polling does not replay result');
});

test('rechazo y fin de partida también tienen una pausa antes del resultado', () => {
  const game = createGame([0,1].map(i => ({ id:String(i), name:`Jugador ${i}`, team:i, bot:false, connected:true })));
  game.scores[0] = 29;
  callBid(game, 0, 'truco');
  const previous = structuredClone(view(game, 0));
  answerBid(game, 1, false);
  const frames = presentationFrames(previous, structuredClone(view(game, 0)));
  assert.equal(frames[0].game.status, 'playing');
  assert.match(frames[0].game.message, /No quiero/);
  assert.equal(frames[1].game.status, 'finished');
});
