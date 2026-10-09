import type { Speech, View } from '../shared/game.ts';

export const SPEECH_DURATION = 3200;

// Use stable seat IDs, never display names: two players can share a name.
export function newSpeech(game: View, after: number): Speech[] {
  return (game.speech ?? []).filter((event) => event.id > after && event.round === game.round);
}

export function lastSpeechId(game: View): number {
  return game.speech?.at(-1)?.id ?? 0;
}
