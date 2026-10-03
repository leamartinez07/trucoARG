import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Connection } from '../src/connection.ts';

test('respuestas demoradas no retroceden cartas ni reabren una mesa abandonada', async () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => 'f'.repeat(64) },
  });
  const pending: ((value: Response) => void)[] = [];
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    () => new Promise<Response>((resolve) => pending.push(resolve)),
  );
  const connection = new Connection();
  const snapshots: unknown[] = [];
  connection.on('room', (room) => snapshots.push(room));
  const response = (revision: number) =>
    new Response(JSON.stringify({ ok: true, code: 'ABC123', room: { code: 'ABC123', revision } }));
  try {
    const joined = connection.request({ action: 'resume', code: 'ABC123' });
    pending[0](response(1));
    await joined;
    const oldPoll = connection.request({ action: 'poll' });
    const move = connection.request({ action: 'play', card: 'espadas-1' });
    pending[2](response(3));
    await move;
    pending[1](response(2));
    await oldPoll;
    assert.deepEqual(snapshots, [
      { code: 'ABC123', revision: 1 },
      { code: 'ABC123', revision: 3 },
    ]);
    const lastPoll = connection.request({ action: 'poll' });
    const leave = connection.request({ action: 'leave' });
    pending[4](new Response(JSON.stringify({ ok: true, room: null })));
    await leave;
    pending[3](response(4));
    await lastPoll;
    assert.equal(snapshots.length, 3);
    assert.equal(snapshots.at(-1), null);
  } finally {
    fetchMock.mock.restore();
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else delete (globalThis as Record<string, unknown>).localStorage;
  }
});
