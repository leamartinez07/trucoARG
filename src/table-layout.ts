import { visibleTricks } from '../shared/game.ts';
import type { Game, Play } from '../shared/game.ts';

// Player indices increase to the right, counterclockwise, from every viewer's seat.
export const relativeSeat = (seat: number, viewer: number, count: number) =>
  (seat - viewer + count) % count;

// Anchors center the complete pile, independent of how many tricks were played.
// Side seats face across the table; the far row faces the viewer.
const piles: Record<number, readonly (readonly [number, number])[]> = {
  2: [[50, 52.5], [50, 31.5]],
  4: [[50, 52.5], [76, 43], [50, 31.5], [24, 43]],
  6: [[50, 52.5], [79, 53], [76, 31.5], [50, 31.5], [24, 31.5], [21, 53]],
};
const directions: Record<number, readonly string[]> = {
  2: ['down', 'up'],
  4: ['down', 'right', 'up', 'left'],
  6: ['down', 'down-right', 'up-right', 'up', 'up-left', 'down-left'],
};
export function playedPosition(relative: number, count: number) {
  const [left, top] = piles[count][relative];
  return { left: `${left}%`, top: `${top}%`, '--pile-x': `${left}%`, '--pile-y': `${top}%` };
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
