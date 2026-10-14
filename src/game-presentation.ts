import type { View } from '../shared/game.ts';
import { gameNotice } from './game-notice.ts';
import { lastSpeechId } from './player-speech.ts';

export const CALL_PAUSE = 1500;
export const ANSWER_PAUSE = 2000;
export const RESULT_PAUSE = 2700;
export type PresentationFrame = { game: View; duration: number };

// Presentation only: scores and rules remain authoritative in the game engine.
export function presentationFrames(previous: View, next: View): PresentationFrame[] {
  const answer = (next.speech ?? []).find(e => e.id > lastSpeechId(previous) && e.round === next.round && e.kind !== 'call');
  const result = gameNotice(next)?.kind === 'result';
  const frames: PresentationFrame[] = [];
  if (answer && result) {
    const message = `${next.players[answer.seat].name}: ${answer.text}`;
    frames.push({ game: { ...previous, bid: null, speech: next.speech, message,
      log: [...previous.log, message] }, duration: ANSWER_PAUSE });
  }
  const freshCall = lastSpeechId(next) > lastSpeechId(previous) && next.speech?.at(-1)?.kind === 'call';
  const freshResult = result && (next.message !== previous.message || next.status !== previous.status);
  frames.push({ game: next, duration: freshResult ? RESULT_PAUSE : answer ? ANSWER_PAUSE : freshCall ? CALL_PAUSE : 0 });
  return frames;
}
