import type { View } from '../shared/game.ts';

export type GameNotice = {
  kind: 'call' | 'result';
  kicker: string;
  title: string;
  detail?: string;
  milestone?: string;
};

function lastCaller(g: View, name: string) {
  const call = [...g.log].reverse().find((line) => line.endsWith(`¡${name}!`));
  return call?.split(': ¡')[0] ?? 'El rival';
}

export function gameNotice(g: View): GameNotice | null {
  if (g.status === 'finished') {
    const winner = g.scores[0] >= g.target ? 0 : 1;
    const envido = g.message.match(/^(.+?) tiene (\d+)\. \+(\d+) de envido\.$/);
    const round = g.message.match(/^Equipo (?:celeste|crema) gana la mano\. \+(\d+) puntos?\.$/);
    return {
      kind: 'result',
      kicker: winner === g.players[g.seat].team ? 'Ganó tu equipo' : 'Ganó el otro equipo',
      title: 'FIN DE PARTIDA',
      detail: envido
        ? `${envido[1]}: ${envido[2]} tantos · +${envido[3]} puntos · ${g.scores[0]} a ${g.scores[1]}`
        : round
          ? `+${round[1]} puntos · ${g.scores[0]} a ${g.scores[1]}`
          : `${g.scores[0]} a ${g.scores[1]}`,
    };
  }

  const envidoResult = g.message.match(/^(.+?) tiene (\d+)\. \+(\d+) de envido\.$/);
  if (envidoResult)
    return {
      kind: 'result',
      kicker: `${envidoResult[1]} ganó el envido`,
      title: `${envidoResult[2]} TANTOS`,
      detail: `+${envidoResult[3]} puntos`,
    };

  const envidoRejected = g.message.match(/^Envido no querido\. \+(\d+)\.$/);
  if (envidoRejected) {
    const lastBid = [...g.log]
      .reverse()
      .find((line) => /: ¡(?:envido|real envido|falta envido)!$/.test(line));
    return {
      kind: 'result',
      kicker: `${lastBid?.split(': ¡')[0] ?? 'El equipo'} ganó el envido`,
      title: `+${envidoRejected[1]} PUNTOS`,
      detail: 'No quisieron',
    };
  }

  const roundResult = g.message.match(/^Equipo (celeste|crema) gana la mano\. \+(\d+) puntos?\.$/);
  if (roundResult) {
    const winner = roundResult[1] === 'celeste' ? 0 : 1;
    return {
      kind: 'result',
      kicker: winner === g.players[g.seat].team ? 'Ganó tu equipo' : 'Ganó el otro equipo',
      title: `+${roundResult[2]} ${Number(roundResult[2]) === 1 ? 'PUNTO' : 'PUNTOS'}`,
      detail: `Mano ${g.round}`,
    };
  }

  if (g.status === 'playing' && g.bid)
    return {
      kind: 'call',
      kicker: `${lastCaller(g, g.bid.name)} cantó`,
      title: `¡${g.bid.name.toUpperCase()}!`,
      detail: `${g.bid.points} ${g.bid.points === 1 ? 'punto' : 'puntos'} en juego`,
    };
  return null;
}
