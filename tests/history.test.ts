import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Match } from '../src/Profile.tsx';

test('historial privado, cartas completas al terminar y persistencia tras reinicio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truco-history-'));
  const tokens = Array.from({ length: 3 }, () => randomBytes(32).toString('hex'));
  let server: ReturnType<typeof spawn>;
  const launch = async () => {
    server = spawn(process.execPath, ['server/index.ts'], {
      env: { ...process.env, PORT: '3098', TRUCO_DB: join(dir, 'test.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await Promise.race([
      once(server.stdout!, 'data'),
      new Promise((_, reject) =>
        setTimeout(() => reject(Error('No arrancó el servidor')), 7000).unref(),
      ),
    ]);
  };
  const stop = async () => {
    const done = once(server, 'exit');
    server.kill();
    await done;
  };
  const request = async (seat: number, data: Record<string, unknown>) => {
    const response = await fetch('http://127.0.0.1:3098/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[seat]}` },
      body: JSON.stringify(data),
    });
    return (await response.json()) as {
      ok: boolean;
      error?: string;
      code?: string;
      room?: { game?: { hand: { id: string }[]; status: string; round: number } };
      matches?: Match[];
    };
  };
  await launch();
  try {
    const made = await request(0, { action: 'create', size: 2, target: 15, name: 'Lean' });
    assert.ok(made.ok, made.error ?? 'No se creó la mesa');
    const code = made.code;
    assert.ok((await request(1, { action: 'join', code, name: 'Amigo' })).ok);
    assert.ok((await request(0, { action: 'start', code })).ok);
    assert.equal((await request(0, { action: 'history' })).matches?.length, 0);
    assert.equal((await request(2, { action: 'poll', code })).ok, false);
    assert.ok((await request(0, { action: 'bid', name: 'falta envido', code })).ok);
    const finished = await request(1, { action: 'answer', accept: true, code });
    assert.equal(finished.room?.game?.status, 'finished');
    const mine = (await request(0, { action: 'history' })).matches!;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].rounds.length, 1);
    assert.equal(new Set(mine[0].rounds[0].hands.flat().map((c) => c.id)).size, 6);
    assert.deepEqual(
      mine[0].actions.map((a) => a.action),
      ['bid', 'answer'],
    );
    assert.equal((await request(1, { action: 'history' })).matches?.[0].id, mine[0].id);
    assert.equal((await request(2, { action: 'history' })).matches?.length, 0);
    await stop();
    await launch();
    assert.deepEqual((await request(0, { action: 'history' })).matches, mine);
    assert.equal((await request(1, { action: 'resume', code })).room?.game?.status, 'finished');
  } finally {
    await stop();
  }
});
