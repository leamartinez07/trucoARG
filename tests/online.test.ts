import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { View, Player } from '../shared/game.ts';

type Room = {
  code: string;
  players: Player[];
  game: View | null;
  chat: { name: string; text: string }[];
};
type Reply = {
  ok: boolean;
  error?: string;
  id?: string;
  code?: string;
  room?: Room | null;
  tables?: { code: string; host: string; size: number; target: number; count: number }[];
};

const token = () => randomBytes(32).toString('hex');

function client(base: string) {
  let code = '';
  return {
    get code() {
      return code;
    },
    set code(value: string) {
      code = value;
    },
    async send(playerToken: string, data?: Record<string, unknown>): Promise<Reply> {
      const response = await fetch(`${base}/api/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${playerToken}` },
        body: JSON.stringify({ code, ...data }),
      });
      const reply = (await response.json()) as Reply;
      if (reply.ok && reply.code) code = reply.code;
      if (reply.room === null) code = '';
      return reply;
    },
  };
}

test('salas reales: 1v1, 2v2, 3v3, manos privadas, turnos y reconexión', async () => {
  const port = 3099;
  const base = `http://127.0.0.1:${port}`;
  const server: ChildProcess = spawn(process.execPath, ['server/index.ts'], {
    env: { ...process.env, PORT: String(port), TRUCO_DB: ':memory:' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await Promise.race([
      once(server.stdout!, 'data'),
      new Promise((_, reject) => setTimeout(() => reject(Error('Servidor no arrancó')), 7000).unref()),
    ]);
    for (const size of [2, 4, 6]) {
      const tokens = Array.from({ length: size }, token);
      const seats = tokens.map(() => client(base));

      const created = await seats[0]!.send(tokens[0]!, {
        action: 'create',
        size,
        target: 15,
        name: 'Mano',
        public: size === 4,
      });
      assert.ok(created.ok, created.error ?? '');
      const code = created.code!;
      for (const seat of seats) seat.code = code;

      const listing = (await (await fetch(`${base}/api/game`)).json()) as Reply;
      assert.equal(listing.tables!.some((t) => t.code === code), size === 4);
      if (size === 4) assert.equal(listing.tables!.find((t) => t.code === code)!.count, 1);

      for (let i = 1; i < size; i++) {
        const joined = await seats[i]!.send(tokens[i]!, {
          action: 'join',
          code,
          name: `Jugador ${i}`,
        });
        assert.ok(joined.ok, joined.error ?? '');
      }
      const started = await seats[0]!.send(tokens[0]!, { action: 'start' });
      assert.ok(started.ok, started.error ?? '');

      const listingAfter = (await (await fetch(`${base}/api/game`)).json()) as Reply;
      assert.equal(listingAfter.tables!.some((t) => t.code === code), false);

      const rooms = await Promise.all(
        seats.map((seat, i) => seat.send(tokens[i]!, { action: 'poll' })),
      );
      const hands = rooms.map((r) => r.room!.game!.hand);
      assert.equal(new Set(hands.flat().map((c) => c.id)).size, size * 3);
      for (const r of rooms) {
        const game = r.room!.game!;
        assert.equal('hands' in game, false);
        assert.equal('original' in game, false);
        assert.equal(game.hand.length, 3);
      }

      const outOfTurn = await seats[1]!.send(tokens[1]!, { action: 'play', card: hands[1]![0]!.id });
      assert.equal(outOfTurn.ok, false);
      const wrongCard = await seats[0]!.send(tokens[0]!, { action: 'play', card: hands[1]![0]!.id });
      assert.equal(wrongCard.ok, false);
      const legal = await seats[0]!.send(tokens[0]!, { action: 'play', card: hands[0]![0]!.id });
      assert.ok(legal.ok, legal.error ?? '');

      // Reconnection: identity comes from the bearer token itself, so a fresh
      // request with the same token (no socket, no session) still resumes the
      // same seat with the same private hand.
      const resumed = client(base);
      resumed.code = code;
      const back = await resumed.send(tokens[1]!, { action: 'poll' });
      assert.ok(back.ok, back.error ?? '');
      assert.deepEqual(back.room!.game!.hand, hands[1]);
      const secondPlay = await resumed.send(tokens[1]!, { action: 'play', card: hands[1]![0]!.id });
      assert.ok(secondPlay.ok, secondPlay.error ?? '');
    }
  } finally {
    server.kill();
  }
});
