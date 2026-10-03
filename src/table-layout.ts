import { visibleTricks } from '../shared/game.ts';
import type { Game, Play } from '../shared/game.ts';

// Player indices increase to the right, counterclockwise, from every viewer's seat.
export const relativeSeat = (seat: number, viewer: number, count: number) =>
  (seat - viewer + count) % count;

// The first card starts on the inner end of each arm. The next two move toward
// the seat that played them. Six-player tables use diagonal arms at the corners.
const piles: Record<number, readonly (readonly [number, number])[]> = {
  2: [
    [50, 56],
    [50, 30],
  ],
  4: [
    [50, 56],
    [68, 49],
    [50, 30],
    [32, 49],
  ],
  6: [
    [50, 56],
    [74, 70],
    [74, 30],
    [50, 30],
    [26, 30],
    [26, 70],
  ],
};
const directions: Record<number, readonly string[]> = {
  2: ['down', 'up'],
  4: ['down', 'right', 'up', 'left'],
  6: ['down', 'down-right', 'up-right', 'up', 'up-left', 'down-left'],
};
export function playedPosition(relative: number, count: number) {
  const [left, top] = piles[count][relative];
  return { left: `${left}%`, top: `${top}%` };
}
export function pileDirection(relative: number, count: number) {
  return directions[count][relative];
}
export function orderedSeatCards(
  g: Pick<Game, 'trickPlays' | 'table' | 'tricks' | 'plays'>,
  seat: number,
): (Play & { trick: number })[] {
  return visibleTricks(g).flatMap((trick, index) =>
    trick.filter((play) => play.seat === seat).map((play) => ({ ...play, trick: index })),
  );
}
