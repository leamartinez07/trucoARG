import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, callBid, answerBid, deal, playCard, view } from '../shared/game.ts';
import { lastSpeechId, newSpeech } from '../src/player-speech.ts';
import type { Player } from '../shared/game.ts';

const players = (count: number): Player[] => Array.from({ length: count }, (_, seat) => ({
  id: String(seat), name: 'Mismo nombre', team: seat % 2, bot: false, connected: true,
}));

test('quiero queda asociado al asiento correcto para todos los espectadores', () => {
  for (const count of [2, 4, 6]) {
    const g = createGame(players(count));
    callBid(g, 0, 'truco');
    answerBid(g, count - 1, true);
    playCard(g, 0, g.hands[0][0].id);
    for (let viewer = 0; viewer < count; viewer++) {
      const events = newSpeech(view(g, viewer), 0);
      assert.deepEqual(events.map(({ seat, text }) => ({ seat, text })), [
        { seat: 0, text: '¡truco!' }, { seat: count - 1, text: '¡Quiero!' },
      ]);
      assert.deepEqual(newSpeech(view(g, viewer), lastSpeechId(view(g, viewer))), []);
    }
  }
});

test('envido querido, no querido y truco suspendido conservan la respuesta', () => {
  for (const accept of [true, false]) {
    const g = createGame(players(4));
    callBid(g, 0, 'truco');
    callBid(g, 1, 'envido');
    answerBid(g, 2, accept);
    assert.equal(g.bid?.name, 'truco');
    assert.equal(g.speech?.at(-1)?.seat, 2);
    assert.equal(g.speech?.at(-1)?.kind, accept ? 'accept' : 'reject');
    answerBid(g, 3, false);
    assert.equal(g.status, 'round-end');
    assert.equal(g.speech?.at(-1)?.text, 'No quiero');
    const cursor = lastSpeechId(view(g, 0));
    deal(g);
    assert.deepEqual(newSpeech(view(g, 0), 0), []);
    callBid(g, 1, 'truco');
    assert.equal(newSpeech(view(g, 0), cursor).length, 1);
  }
});

test('mesas antiguas, acciones inválidas y persistencia JSON no rompen los globos', () => {
  const g = createGame(players(2));
  delete g.speech;
  assert.deepEqual(newSpeech(view(g, 0), 0), []);
  assert.throws(() => answerBid(g, 1, true));
  assert.equal(g.speech, undefined);
  callBid(g, 0, 'envido');
  assert.throws(() => answerBid(g, 0, true));
  assert.equal(view(g, 0).speech?.length, 1);
  answerBid(g, 1, true);
  const restored = JSON.parse(JSON.stringify(g));
  assert.equal(newSpeech(view(restored, 1), 1)[0].text, '¡Quiero!');
});

test('historial acotado mantiene IDs únicos en cantos repetidos', () => {
  const g = createGame(players(2), 1000);
  for (let n = 0; n < 20; n++) {
    callBid(g, g.turn, 'truco');
    answerBid(g, 1 - g.turn, false);
    deal(g);
  }
  assert.equal(g.speech?.length, 30);
  assert.equal(g.speech?.at(-1)?.id, 40);
  assert.equal(new Set(g.speech?.map((event) => event.id)).size, 30);
});
