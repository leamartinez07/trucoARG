import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.argv[2];
if (!base?.startsWith('https://') && !base?.startsWith('http://localhost:'))
  throw Error('Uso: node scripts/verify-deploy.mjs https://tu-dominio.vercel.app');
const post = async (token, data) => {
  const res = await fetch(`${base}/api/game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  });
  const result = await res.json();
  return result;
};
const outsider = randomBytes(32).toString('hex');
for (const size of [2, 4, 6]) {
  const tokens = Array.from({ length: size }, () => randomBytes(32).toString('hex'));
  const created = await post(tokens[0], {
    action: 'create',
    name: 'Verificación 1',
    size,
    target: 15,
    public: false,
  });
  assert.ok(created.ok, created.error);
  const code = created.code;
  const send = (seat, data) => post(tokens[seat], { code, ...data });
  for (let seat = 1; seat < size; seat++) {
    const joined = await send(seat, { action: 'join', name: `Verificación ${seat + 1}` });
    assert.ok(joined.ok, joined.error);
  }
  await Promise.all(tokens.map((_, seat) => send(seat, { action: 'poll' })));
  const started = await send(0, { action: 'start' });
  assert.ok(started.ok, started.error);
  const views = await Promise.all(tokens.map((_, seat) => send(seat, { action: 'poll' })));
  for (const v of views) {
    assert.ok(v.ok, v.error);
    assert.equal(v.room.game.hand.length, 3);
    assert.equal('hands' in v.room.game, false);
    assert.equal('original' in v.room.game, false);
  }
  assert.equal(new Set(views.flatMap((v) => v.room.game.hand.map((c) => c.id))).size, size * 3);
  assert.equal((await post(outsider, { action: 'poll', code })).ok, false);
  const invalidBid = await send(0, { action: 'bid', name: 'inventado envido' });
  assert.equal(invalidBid.ok, false);
  const card = views[0].room.game.hand[0].id;
  const simultaneous = await Promise.all([
    send(0, { action: 'play', card }),
    send(0, { action: 'play', card }),
  ]);
  assert.equal(simultaneous.filter((r) => r.ok).length, 1);
  let current = simultaneous.find((r) => r.ok);
  assert.equal(current.room.game.trickPlays[0].length, 1);
  for (let seat = 1; seat < size; seat++) {
    assert.equal(current.room.game.turn, seat);
    current = await send(seat, { action: 'play', card: views[seat].room.game.hand[0].id });
    assert.ok(current.ok, current.error);
  }
  const firstTrick = current.room.game.trickPlays[0];
  assert.deepEqual(
    firstTrick.map((p) => p.seat),
    tokens.map((_, seat) => seat),
  );
  const winnerSeat = current.room.game.turn;
  const winnerView = await send(winnerSeat, { action: 'poll' });
  current = await send(winnerSeat, { action: 'play', card: winnerView.room.game.hand[0].id });
  assert.ok(current.ok, current.error);
  assert.deepEqual(current.room.game.trickPlays[0], firstTrick);
  assert.equal(current.room.game.trickPlays[1][0].seat, winnerSeat);
  const resumed = await send(0, { action: 'resume' });
  assert.deepEqual(resumed.room.game.trickPlays, current.room.game.trickPlays);
  assert.equal(typeof resumed.room.revision, 'number');
  // Finish the first round, then check a fresh complete deal and a durable archive.
  assert.ok((await send(1, { action: 'fold' })).ok);
  if (size === 2) {
    await new Promise((resolve) => setTimeout(resolve, 5400));
    assert.equal((await send(1, { action: 'poll' })).room.game.round, 2);
  } else assert.ok((await send(0, { action: 'next' })).ok);
  const second = await Promise.all(tokens.map((_, seat) => send(seat, { action: 'poll' })));
  assert.equal(new Set(second.flatMap((v) => v.room.game.hand.map((c) => c.id))).size, size * 3);
  assert.equal(second[0].room.game.round, 2);
  assert.deepEqual(second[0].room.game.trickPlays, []);
  assert.equal(second[0].room.game.mano, 1);
  assert.ok((await send(1, { action: 'bid', name: 'falta envido' })).ok);
  const finished = await send(0, { action: 'answer', accept: true });
  assert.equal(finished.room.game.status, 'finished');
  const history = await send(0, { action: 'history' });
  const match = history.matches.find((m) => m.code === code);
  assert.ok(match);
  assert.equal(match.rounds.length, 2);
  assert.equal(match.rounds[0].hands.flat().length, size * 3);
  assert.ok(match.actions.some((a) => a.action === 'play' && a.detail === card));
  assert.equal((await post(outsider, { action: 'history' })).matches.length, 0);
  const teammateHistory = await send(size - 1, { action: 'history' });
  assert.ok(teammateHistory.matches.some((m) => m.id === match.id));
  assert.equal((await send(0, { action: 'resume' })).room.game.status, 'finished');
  console.log(
    `${size / 2}v${size / 2}: reparto, privacidad, concurrencia, reconexión e historial OK`,
  );
}
console.log('Verificación del despliegue completada. Las mesas de prueba son privadas.');
