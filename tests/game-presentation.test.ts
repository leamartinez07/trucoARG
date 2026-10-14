import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, view, callBid, answerBid, fold } from '../shared/game.ts';
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

for (const count of [2, 4, 6]) test(`irse al mazo muestra al jugador antes de sumar puntos, ${count} jugadores`, () => {
  const game = createGame(Array.from({length: count}, (_, i) => ({id: String(i), name: `Jugador ${i}`, team: i % 2, bot: false, connected: true})));
  const previous = structuredClone(view(game, 0));
  fold(game, count - 1);
  assert.equal(game.speech?.at(-1)?.seat, count - 1);
  assert.equal(game.speech?.at(-1)?.kind, 'fold');
  const frames = presentationFrames(previous, structuredClone(view(game, 0)));
  assert.equal(frames.length, 2);
  assert.match(frames[0].game.message, /Me voy al mazo/);
  assert.deepEqual(frames[0].game.scores, previous.scores);
  assert.equal(frames[0].duration, ANSWER_PAUSE);
  assert.equal(frames[1].game.status, 'round-end');
  assert.equal(frames[1].game.scores[0], 1);
  const events = game.speech?.length;
  assert.throws(() => fold(game, 0));
  assert.equal(game.speech?.length, events);
});
