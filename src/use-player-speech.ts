import { useEffect, useRef, useState } from 'react';
import type { Speech, View } from '../shared/game.ts';
import { lastSpeechId, newSpeech, SPEECH_DURATION } from './player-speech.ts';

type VisibleSpeech = Speech & { expires: number };

export function usePlayerSpeech(game: View | null, scope: string) {
  const cursor = useRef<{ scope: string; id: number } | null>(null);
  const [visible, setVisible] = useState<VisibleSpeech[]>([]);

  useEffect(() => {
    if (!game) {
      cursor.current = null;
      setVisible([]);
      return;
    }
    const id = lastSpeechId(game);
    const previous = cursor.current;
    cursor.current = { scope, id };
    // Opening/rejoining a table must not replay old conversations.
    if (!previous || previous.scope !== scope || id < previous.id) {
      setVisible([]);
      return;
    }
    const events = newSpeech(game, previous.id);
    const now = Date.now();
    setVisible((current) => {
      const bySeat = new Map(current
        .filter((event) => event.round === game.round && event.expires > now)
        .map((event) => [event.seat, event]));
      for (const event of events)
        bySeat.set(event.seat, { ...event, expires: now + SPEECH_DURATION });
      return [...bySeat.values()];
    });
  }, [game, scope]);

  useEffect(() => {
    if (!visible.length) return;
    const next = Math.min(...visible.map((event) => event.expires));
    const timer = setTimeout(() => {
      setVisible((current) => current.filter((event) => event.expires > Date.now()));
    }, Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [visible]);

  return visible;
}
