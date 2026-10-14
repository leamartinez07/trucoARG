import { useEffect, useRef, useState } from 'react';
import type { View } from '../shared/game.ts';
import { presentationFrames } from './game-presentation.ts';
import type { PresentationFrame } from './game-presentation.ts';

export function useGamePresentation(raw: View | null, scope: string) {
  const [state, setState] = useState<{ game: View | null; paused: boolean; scope: string }>({ game: raw, paused: false, scope });
  const stream = useRef<{ scope: string; last: View | null; queue: PresentationFrame[]; timer?: ReturnType<typeof setTimeout> }>({ scope, last: null, queue: [] });
  useEffect(() => {
    const current = stream.current;
    if (!raw || current.scope !== scope || !current.last || raw.round < current.last.round) {
      clearTimeout(current.timer);
      current.timer = undefined;
      current.scope = scope;
      current.last = raw ? structuredClone(raw) : null;
      current.queue = [];
      setState({ game: current.last, paused: false, scope });
      return;
    }
    const next = structuredClone(raw);
    if (JSON.stringify(next) === JSON.stringify(current.last)) return;
    const frames = presentationFrames(current.last, next);
    current.last = next;
    // Coalesce polling/card updates, but never drop a response or a result.
    if (current.queue.at(-1)?.duration === 0) current.queue.pop();
    current.queue.push(...frames);
    function advance() {
      current.timer = undefined;
      const frame = current.queue.shift();
      if (!frame) {
        setState(s => ({ ...s, paused: false }));
        return;
      }
      setState({ game: frame.game, paused: frame.duration > 0 || current.queue.length > 0, scope });
      if (frame.duration) current.timer = setTimeout(advance, frame.duration);
      else if (current.queue.length) advance();
    }
    if (!current.timer) advance();
  }, [raw, scope]);
  useEffect(() => () => clearTimeout(stream.current.timer), []);
  return state.scope === scope && (state.game || !raw) ? state : { game: raw, paused: false, scope };
}
