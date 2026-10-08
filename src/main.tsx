import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { connection as socket } from './connection.ts';
import { Profile } from './Profile.tsx';
import {
  ArrowUpRight,
  ArrowRight,
  Copy,
  Check,
  X,
  Volume2,
  VolumeX,
  Music2,
  Users,
  MessageCircle,
  BookOpen,
  Flag,
  Send,
  LogOut,
  Radio,
} from 'lucide-react';
import {
  createGame,
  view,
  botStep,
  deal,
  playCard,
  callBid,
  answerBid,
  fold,
} from '../shared/game.ts';
import { relativeSeat, playedPosition, pileDirection, orderedSeatCards } from './table-layout.ts';
import { gameNotice } from './game-notice.ts';
import type { GameNotice } from './game-notice.ts';
import type { Game, View, Player, Card, BidName } from '../shared/game.ts';
import './style.css';
import './light.css';
import './table-cards.css';
import './table-sidebar.css';
import './brand.css';
import { playCardSound, playCallSound, unlockSounds } from './sounds.ts';
import { Lobby } from './Lobby.tsx';
import { readLocalAvatar, saveLocalAvatar } from './local-avatar.ts';
import type { PublicTable } from './Lobby.tsx';

type Room = {
  code: string;
  size: number;
  target: number;
  players: Player[];
  game: View | null;
  chat: { name: string; text: string }[];
};
const sample: Card[] = [
  { id: 'bastos-1', suit: 'bastos', value: 1 },
  { id: 'oros-7', suit: 'oros', value: 7 },
  { id: 'espadas-1', suit: 'espadas', value: 1 },
];
function CardFace({ card, ...props }: { card: Card } & React.ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      {...props}
      src={`/cards/${card.id}.webp`}
      alt={`${card.value} de ${card.suit}`}
      draggable={false}
    />
  );
}
function MatchstickTally({ count }: { count: number }) {
  return (
    <div className="matchstick-tally" role="img" aria-label={`${count} puntos en palitos`}>
      {count === 0 ? (
        <span className="matchstick-empty">—</span>
      ) : (
        Array.from({ length: Math.ceil(count / 5) }, (_, group) => {
          const sticks = Math.min(5, count - group * 5);
          return (
            <span className="matchstick-group" key={group} aria-hidden="true">
              {Array.from({ length: Math.min(4, sticks) }, (_, stick) => (
                <i className="matchstick" key={stick} />
              ))}
              {sticks === 5 && <i className="matchstick matchstick-fifth" />}
            </span>
          );
        })
      )}
    </div>
  );
}
function App() {
  const [size, setSize] = useState(4),
    [target, setTarget] = useState(30),
    [name, setName] = useState(localStorage.getItem('deuna-name') || ''),
    [code, setCode] = useState(new URLSearchParams(location.search).get('mesa') || '');
  const [tables, setTables] = useState<PublicTable[]>([]);
  const [page, setPage] = useState<'tables' | 'profile'>('tables');
  const [avatar, setAvatar] = useState<string | null>(readLocalAvatar);
  const [room, setRoom] = useState<Room | null>(null),
    [local, setLocal] = useState<View | null>(null),
    [dialog, setDialog] = useState<'rules' | 'discord' | null>(null),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [sound, setSound] = useState(() => localStorage.getItem('truco-sound') !== 'off'),
    [music, setMusic] = useState(false),
    [copied, setCopied] = useState(false),
    [chatText, setChatText] = useState(''),
    [notice, setNotice] = useState<GameNotice | null>(null);
  const localRef = useRef<Game | null>(null),
    noticeKeyRef = useRef(''),
    previousScoresRef = useRef<{ scope: string; scores: number[] } | null>(null),
    previousPlaysRef = useRef<{ scope: string; round: number; count: number } | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dialogRef = useRef<HTMLDialogElement>(null),
    musicRef = useRef<HTMLAudioElement>(null),
    chatMessagesRef = useRef<HTMLDivElement>(null);
  const g = room?.game ?? local;
  const inTable = Boolean(room || local);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [inTable, page]);
  useEffect(() => {
    if (!inTable) {
      musicRef.current?.pause();
      setMusic(false);
    }
  }, [inTable]);
  useEffect(() => {
    if (!sound) return;
    const unlock = () => {
      unlockSounds();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [sound]);
  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }
  useEffect(() => {
    socket.on('connect', () => {
      setConnected(true);
      const saved = sessionStorage.getItem('deuna-session');
      if (saved) {
        try {
          socket.emit(
            'command',
            { action: 'resume', ...JSON.parse(saved) },
            (r: { ok: boolean }) => {
              if (!r.ok) sessionStorage.removeItem('deuna-session');
            },
          );
        } catch {
          sessionStorage.removeItem('deuna-session');
        }
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('room', setRoom);
    socket.on('tables', setTables);
    socket.on('connect_error', () => setConnected(false));
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [dialog]);
  useEffect(() => {
    const messages = chatMessagesRef.current;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, [room?.chat.length]);
  useEffect(() => {
    if (!local) return;
    const timer = setInterval(() => {
      const game = localRef.current;
      if (game && botStep(game)) {
        setLocal(view(game, 0));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [Boolean(local)]);
  useEffect(() => {
    if (local?.status !== 'round-end') return;
    const round = local.round;
    const timer = setTimeout(() => {
      const game = localRef.current;
      if (game?.status === 'round-end' && game.round === round) {
        deal(game);
        setLocal(view(game, 0));
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [local?.status, local?.round]);
  useEffect(() => {
    if (!g) {
      noticeKeyRef.current = '';
      previousScoresRef.current = null;
      setNotice(null);
      return;
    }
    const scope = room?.code ?? 'practice';
    const previous = previousScoresRef.current;
    const buenas =
      g.target > 15 && previous?.scope === scope
        ? g.scores.findIndex((points, team) => previous.scores[team] < 15 && points >= 15)
        : -1;
    previousScoresRef.current = { scope, scores: [...g.scores] };
    const key = [scope, g.round, g.status, g.bid?.name, g.message, ...g.scores].join('|');
    if (noticeKeyRef.current === key) return;
    noticeKeyRef.current = key;
    const current = gameNotice(g);
    setNotice(
      current && buenas >= 0
        ? {
            ...current,
            milestone: `${buenas === g.players[g.seat].team ? 'Tu equipo' : 'El otro equipo'} entró en las buenas`,
          }
        : current,
    );
    if (!current) return;
    if (current.kind === 'call' && sound) playCallSound();
    const timer = setTimeout(() => setNotice(null), 3250);
    return () => clearTimeout(timer);
  }, [room?.code, g?.round, g?.status, g?.message, g?.bid?.name, g?.scores[0], g?.scores[1]]);
  useEffect(() => {
    if (!g) {
      previousPlaysRef.current = null;
      return;
    }
    const scope = room?.code ?? 'practice';
    const plays = g.trickPlays?.flat() ?? g.table;
    const previous = previousPlaysRef.current;
    if (sound && previous?.scope === scope && previous.round === g.round) {
      for (const play of plays.slice(previous.count))
        if (play.seat !== g.seat) playCardSound();
    }
    previousPlaysRef.current = { scope, round: g.round, count: plays.length };
  }, [g?.trickPlays, g?.table, g?.round, g?.seat, room?.code, sound]);
  function command(data: Record<string, unknown>) {
    if (localRef.current) {
      try {
        const game = localRef.current;
        switch (data.action) {
          case 'play':
            playCard(game, 0, String(data.card));
            break;
          case 'bid':
            callBid(game, 0, data.name as BidName);
            break;
          case 'answer':
            answerBid(game, 0, Boolean(data.accept));
            break;
          case 'fold':
            fold(game, 0);
            break;
          case 'next':
            deal(game);
            break;
        }
        setLocal(view(game, 0));
      } catch (e) {
        notify((e as Error).message);
      }
      return;
    }
    if (!socket.connected) {
      notify('No hay conexión con el servidor. Podés practicar mientras tanto.');
      return;
    }
    setBusy(true);
    socket
      .timeout(6000)
      .emit(
        'command',
        data,
        (
          error: Error | null,
          result: { ok: boolean; error?: string; code?: string; token?: string },
        ) => {
          setBusy(false);
          if (error) {
            notify('No llegó la respuesta. Probá nuevamente.');
            return;
          }
          if (!result.ok) notify(result.error || 'No se pudo completar.');
          if (result.token) {
            sessionStorage.setItem(
              'deuna-session',
              JSON.stringify({ code: result.code, token: result.token }),
            );
            localStorage.setItem('deuna-name', name);
          }
        },
      );
  }
  function practice() {
    const playerName = name.trim() || 'Vos';
    const botNames = ['Tito', 'La Negra', 'Rolo', 'Luli', 'Cacho', 'Mora', 'Fede']
      .filter((botName) => botName.toLocaleLowerCase() !== playerName.toLocaleLowerCase());
    const players: Player[] = Array.from({ length: size }, (_, i) => ({
      id: `local-${i}`,
      name: i === 0 ? playerName : botNames[i - 1],
      team: i % 2,
      bot: i !== 0,
      connected: true,
    }));
    localRef.current = createGame(players, target);
    setLocal(view(localRef.current, 0));
  }
  function leave() {
    if (local) {
      localRef.current = null;
      setLocal(null);
    } else {
      command({ action: 'leave' });
      sessionStorage.removeItem('deuna-session');
    }
  }
  async function copyInvite() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/?mesa=${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      notify(`Código de mesa: ${room.code}`);
    }
  }
  const ownTeam = g?.players[g.seat]?.team ?? 0;
  const canPlay = g?.status === 'playing' && g.turn === g.seat && !g.bid;
  const respond = g?.bid && g.bid.team !== ownTeam;
  const nextBid = g
    ? (['', 'truco', 'retruco', 'vale cuatro'][
        g.bid?.kind === 'truco' ? g.bid.points : g.stake
      ] as BidName)
    : 'truco';
  const currentScore = g ? g.scores : [0, 0];
  const gameTarget = g?.target ?? room?.target ?? target;
  return (
    <div className={`app-shell ${inTable ? 'app-game' : page === 'profile' ? 'app-profile' : 'app-lobby'}`}>
      <audio ref={musicRef} src="/audio/quiet-guitar.ogg" preload="none" loop />
      <header className="site-header">
        <button
          className="wordmark"
          onClick={() => {
            if (inTable) leave();
            setPage('tables');
          }}
          aria-label="Faltaenvidoytruco, inicio"
        >
          <strong>Faltaenvidoytruco</strong>
          <span className="wordmark-flower" aria-hidden="true" />
        </button>
        <nav>
          <button
            className={!inTable && page === 'tables' ? 'nav-active' : ''}
            onClick={() => {
              if (inTable) leave();
              setPage('tables');
            }}
          >
            Mesas
          </button>
          <button
            className={page === 'profile' ? 'nav-active' : ''}
            onClick={() => setPage('profile')}
          >
            Mi perfil
          </button>
          <button aria-label="Reglas" onClick={() => setDialog('rules')}>
            <BookOpen size={16} />
            <span>Reglas</span>
          </button>
        </nav>
        <div className="header-tools">
          {inTable && (
            <button
              className="music-toggle"
              aria-label={music ? 'Pausar música' : 'Reproducir música de fondo'}
              aria-pressed={music}
              title={music ? 'Pausar música' : 'Música de fondo'}
              onClick={() => {
                const player = musicRef.current;
                if (!player) return;
                if (music) {
                  player.pause();
                  setMusic(false);
                } else {
                  player.volume = 0.055;
                  void player.play().then(() => setMusic(true)).catch(() =>
                    notify('No se pudo reproducir la música en este navegador.'),
                  );
                }
              }}
            >
              <Music2 size={18} />
            </button>
          )}
          <button
            className="discord-control"
            aria-label="Discord"
            onClick={() => setDialog('discord')}
          >
            <MessageCircle size={16} />
            <span>Discord</span>
          </button>
          <button
            className="sound-toggle"
            aria-label={sound ? 'Silenciar sonidos' : 'Activar sonidos'}
            onClick={() => setSound((value) => {
              localStorage.setItem('truco-sound', value ? 'off' : 'on');
              if (!value) unlockSounds();
              return !value;
            })}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </header>
      {page === 'profile' ? (
        <Profile name={name} notify={notify} avatar={avatar} onAvatarChange={(value) => {
          try {
            saveLocalAvatar(value);
            setAvatar(value);
          } catch {
            notify('No se pudo guardar la foto en este navegador.');
          }
        }} />
      ) : !inTable ? (
        <Lobby
          name={name}
          setName={setName}
          size={size}
          setSize={setSize}
          target={target}
          setTarget={setTarget}
          code={code}
          setCode={setCode}
          tables={tables}
          connected={connected}
          busy={busy}
          command={command}
          practice={practice}
          notify={notify}
        />
      ) : (
        <main className="game-page">
          <div className="game-top">
            <div>
              <button className="back-link" onClick={leave}>
                <LogOut size={16} />
                Salir de la mesa
              </button>
              <h1>{local ? 'Práctica' : `Mesa ${room?.code}`}</h1>
            </div>
            <div className="table-meta">
              <span>
                {(room?.size ?? size) / 2} vs {(room?.size ?? size) / 2} · a{' '}
                {room?.target ?? target} · sin flor
              </span>
              {room && (
                <button className="invite" onClick={copyInvite}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}Mesa {room.code}
                </button>
              )}
              {local && <span className="practice-badge">CON BOTS</span>}
            </div>
          </div>
          <div className={`game-layout ${g?.players.length === 6 ? 'game-layout-wide' : ''}`}>
            <section className="table-wrap">
              <div className="mobile-score" aria-label="Puntaje de la partida">
                <span>{(g?.players.length ?? room?.size ?? size) === 2 ? 'Vos' : 'Nosotros'} <strong>{currentScore[ownTeam]}</strong></span>
                <span className="mobile-score-divider" aria-hidden="true" />
                <span>{(g?.players.length ?? room?.size ?? size) === 2 ? 'Rival' : 'Ellos'} <strong>{currentScore[1 - ownTeam]}</strong></span>
              </div>
              <div className="table-top">
                <span>
                  <i />
                  {local ? 'PRÁCTICA LOCAL' : connected ? 'MESA CONECTADA' : 'RECONECTANDO…'}
                </span>
                <span>
                  {g && (
                    <span className="compact-self-name">{g.players[g.seat].name} (vos) · </span>
                  )}
                  {g ? `MANO ${String(g.round).padStart(2, '0')}` : 'ESPERANDO A LA BANDA'}
                </span>
              </div>
              <div className={`playing-table seats-${g?.players.length ?? room?.size ?? size}`}>
                {notice && (
                  <div className={`game-notice notice-${notice.kind}`} role="status" aria-live="polite">
                    <span className="game-notice-kicker">{notice.kicker}</span>
                    <strong>{notice.title}</strong>
                    {notice.detail && <span className="game-notice-detail">{notice.detail}</span>}
                    {notice.milestone && (
                      <span className="game-notice-milestone">{notice.milestone}</span>
                    )}
                  </div>
                )}
                {g ? (
                  <>
                    <div className="table-watermark">
                      Faltaenvidoytruco<span>TRUCO ENTRE AMIGOS</span>
                    </div>
                    {g.players.map((p, i) => {
                      const relative = relativeSeat(i, g.seat, g.players.length);
                      return (
                        <div
                          key={p.id}
                          className={`seat seat-${relative} ${g.turn === i && g.status === 'playing' ? 'seat-turn' : ''} ${relative === 0 ? 'self-seat' : ''}`}
                        >
                          <div className={`avatar team-${p.team}`}>
                            {i === g.seat && avatar ? <img className="avatar-photo" src={avatar} alt="" /> : p.name.slice(0, 1).toUpperCase()}
                            {g.mano === i && <span className="mano-mark">M</span>}
                          </div>
                          <span className="seat-name">
                            {i === g.seat ? `${p.name} (vos)` : p.name}
                            {!p.connected ? ' · sin conexión' : ''}
                          </span>
                          {relative !== 0 && (
                            <div className="backs">
                              {Array.from({ length: g.remaining[i] }, (_, n) => (
                                <div className="card-back" key={n} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {g.players.map((player, seat) => {
                      const relative = relativeSeat(seat, g.seat, g.players.length);
                      const cards = orderedSeatCards(g, seat);
                      if (!cards.length) return null;
                      return (
                        <div
                          key={player.id}
                          className={`played-pile pile-${pileDirection(relative, g.players.length)}`}
                          data-seat={seat}
                          data-relative-seat={relative}
                          style={playedPosition(relative, g.players.length)}
                          role="group"
                          aria-label={`${player.name}, cartas jugadas`}
                        >
                          <div className="played-pile-cards">
                            {cards.map((play) => (
                              <div
                                className="played-card"
                                key={play.card.id}
                                data-trick={play.trick + 1}
                                tabIndex={0}
                                aria-label={`${player.name}: ${play.card.value} de ${play.card.suit}, ${play.trick + 1}ª baza`}
                              >
                                <CardFace
                                  card={play.card}
                                  title={`${player.name} · ${play.trick + 1}ª baza`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="my-hand">
                      {g.hand.map((card, i) => (
                        <button
                          key={card.id}
                          style={
                            {
                              '--tilt': `${(i - (g.hand.length - 1) / 2) * 6}deg`,
                            } as React.CSSProperties
                          }
                          disabled={!canPlay}
                          aria-label={`Tirar ${card.value} de ${card.suit}`}
                          onClick={() => {
                            command({ action: 'play', card: card.id });
                            if (sound) playCardSound();
                          }}
                        >
                          <CardFace card={card} />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="waiting">
                    <div className="waiting-cards">
                      {sample.map((c) => (
                        <CardFace key={c.id} card={c} />
                      ))}
                    </div>
                    <h2>Esperando jugadores</h2>
                    <p>Compartí el código o el link de la mesa.</p>
                    <div className="waiting-loader" role="status" aria-live="polite">
                      <span className="waiting-loader-ring" aria-hidden="true" />
                      <span>Esperando que se sumen...</span>
                    </div>
                    <div className="waiting-players">
                      {Array.from({ length: room!.size }, (_, i) => (
                        <div key={i} className={room!.players[i] ? 'occupied' : ''}>
                          <Users size={20} />
                          <span>{room!.players[i]?.name ?? 'Lugar libre'}</span>
                        </div>
                      ))}
                    </div>
                    <button className="primary" onClick={copyInvite}>
                      {copied ? 'Link copiado' : 'Copiar invitación'}
                      <Copy size={17} />
                    </button>
                    {room!.players[0]?.id === socket.id && (
                      <button
                        className="start-online"
                        onClick={() =>
                          command({ action: 'start', bots: room!.players.length < room!.size })
                        }
                      >
                        {room!.players.length === room!.size
                          ? 'Repartir cartas'
                          : 'Completar con bots y jugar'}
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                )}
                {g && g.status !== 'round-end' && (
                  <div className="game-actions">
                    {g.status === 'finished' ? (
                      <button className="primary" onClick={leave}>
                        Volver al club <ArrowRight size={17} />
                      </button>
                    ) : respond ? (
                      <>
                        <span className="answer-label">¿Qué decís?</span>
                        <button
                          className="primary"
                          onClick={() => command({ action: 'answer', accept: true })}
                        >
                          ¡Quiero!
                        </button>
                        <button
                          className="outline"
                          onClick={() => command({ action: 'answer', accept: false })}
                        >
                          No quiero
                        </button>
                        {g.bid?.kind === 'truco' && g.bid.points < 4 && (
                          <button
                            className="call"
                            onClick={() => command({ action: 'bid', name: nextBid })}
                          >
                            {nextBid}
                          </button>
                        )}
                        {g.bid?.name === 'truco' &&
                          !g.envidoDone &&
                          g.tricks.length === 0 &&
                          g.hand.length === 3 && (
                            <button
                              className="call"
                              onClick={() => command({ action: 'bid', name: 'envido' })}
                            >
                              Envido primero
                            </button>
                          )}
                        {g.bid?.kind === 'envido' && g.bid.name !== 'falta envido' && (
                          <>
                            {g.bid.name === 'envido' && g.bid.envidos < 2 && (
                              <button
                                className="call"
                                onClick={() => command({ action: 'bid', name: 'envido' })}
                              >
                                Envido
                              </button>
                            )}
                            {g.bid.name === 'envido' && (
                              <button
                                className="call"
                                onClick={() => command({ action: 'bid', name: 'real envido' })}
                              >
                                Real envido
                              </button>
                            )}
                            <button
                              className="call"
                              onClick={() => command({ action: 'bid', name: 'falta envido' })}
                            >
                              Falta envido
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {canPlay &&
                          !g.envidoDone &&
                          g.tricks.length === 0 &&
                          g.hand.length === 3 &&
                          !g.bid && (
                            <>
                              <div className="bid-buttons">
                                {(['envido', 'real envido', 'falta envido'] as BidName[]).map(
                                  (b) => (
                                    <button
                                      key={b}
                                      className="call"
                                      onClick={() => command({ action: 'bid', name: b })}
                                    >
                                      {b}
                                    </button>
                                  ),
                                )}
                              </div>
                              <div className="bid-divider" />
                            </>
                          )}
                        {canPlay &&
                          g.stake < 4 &&
                          (g.raiseTeam === null || g.raiseTeam === ownTeam) && (
                            <button
                              className="primary truco-call"
                              onClick={() => command({ action: 'bid', name: nextBid })}
                            >
                              ¡{nextBid}!
                            </button>
                          )}
                        <button
                          className="fold"
                          disabled={Boolean(g.bid)}
                          onClick={() => command({ action: 'fold' })}
                        >
                          <Flag size={15} />
                          Al mazo
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="table-status">
                <span className="status-pulse" />
                <span>
                  {g
                    ? g.players.some((p) => !p.connected)
                      ? 'Esperamos a que vuelva quien se desconectó.'
                      : g.bid
                        ? `${g.players.find((p) => p.team === g.bid!.team)?.name} cantó ${g.bid.name}.`
                        : g.status === 'playing'
                          ? g.turn === g.seat
                            ? 'Te toca. Elegí una carta y jugala.'
                            : `Juega ${g.players[g.turn].name}.`
                          : g.message
                    : `${room!.players.length} de ${room!.size} jugadores en la mesa.`}
                </span>
                {g && (
                  <span className="envido-count">
                    Tus tantos: <strong>{g.envidoPoints}</strong>
                  </span>
                )}
              </div>
            </section>
            <aside className="score-sidebar">
              <div className="scoreboard">
                <div className="sidebar-title">
                  <span>EL ANOTADOR</span>
                  <span>✦</span>
                </div>
                <div className="score-sheet">
                  <div className="score-sheet-head">
                    {[ownTeam, 1 - ownTeam].map((team, index) => (
                      <div key={team}>
                        <span>
                          {(g?.players.length ?? room?.size ?? size) === 2
                            ? index === 0
                              ? 'Vos'
                              : g?.players.find((player) => player.team === team)?.name ?? 'Rival'
                            : index === 0
                              ? 'Nosotros'
                              : 'Ellos'}
                        </span>
                        <strong>{currentScore[team]}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="score-phase">
                    <span>{gameTarget > 15 ? 'Malas' : 'Tantos'}</span>
                    <div className="score-phase-tallies">
                      {[ownTeam, 1 - ownTeam].map((team) => (
                        <MatchstickTally key={team} count={Math.min(15, currentScore[team])} />
                      ))}
                    </div>
                  </div>
                  {gameTarget > 15 && (
                    <>
                      <div className="score-sheet-divider" />
                      <div className="score-phase">
                        <span>Buenas</span>
                        <div className="score-phase-tallies">
                          {[ownTeam, 1 - ownTeam].map((team) => (
                            <MatchstickTally
                              key={team}
                              count={Math.max(0, Math.min(15, currentScore[team] - 15))}
                            />
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="trick-track">
                  {[0, 1, 2].map((n) => (
                    <div key={n}>
                      <span>{n + 1}ª BAZA</span>
                      <strong>
                        {g && n < g.tricks.length
                          ? g.tricks[n] === null
                            ? 'Parda'
                            : g.tricks[n] === ownTeam
                              ? 'Nuestra'
                              : 'De ellos'
                          : '—'}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="chat-panel">
                <div className="sidebar-title">
                  <span>CHAT DE LA MESA</span>
                  <MessageCircle size={15} />
                </div>
                {room ? (
                  <>
                    <div className="chat-messages" ref={chatMessagesRef} aria-live="polite">
                      {room.chat.length ? (
                        room.chat.map((m, i) => (
                          <p key={i}>
                            <strong>{m.name}: </strong>
                            {m.text}
                          </p>
                        ))
                      ) : (
                        <p>Todavía no hay mensajes. Decí algo.</p>
                      )}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!chatText.trim()) return;
                        command({ action: 'chat', text: chatText });
                        setChatText('');
                      }}
                    >
                      <input
                        aria-label="Mensaje para la mesa"
                        value={chatText}
                        maxLength={180}
                        onChange={(e) => setChatText(e.target.value)}
                        placeholder="Escribí a la mesa…"
                      />
                      <button aria-label="Enviar mensaje" disabled={!chatText.trim()}>
                        <Send size={16} />
                      </button>
                    </form>
                  </>
                ) : (
                  <p className="chat-practice-note">Disponible en mesas con otras personas.</p>
                )}
              </div>
              <div className="voice-card">
                <button onClick={() => setDialog('discord')}>
                  <MessageCircle size={17} />
                  Voz y cámara por Discord
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <div className="activity">
                <div className="sidebar-title">
                  <span>LO QUE PASÓ</span>
                  <Radio size={14} />
                </div>
                <div className="activity-list">
                  {g?.log
                    .slice(-6)
                    .reverse()
                    .map((line, i) => <p key={`${line}-${i}`}>{line}</p>) ?? (
                    <p>La mesa está esperando jugadores.</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </main>
      )}

      <dialog
        ref={dialogRef}
        onCancel={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDialog(null);
        }}
      >
        <button className="dialog-close" aria-label="Cerrar" onClick={() => setDialog(null)}>
          <X size={22} />
        </button>
        {dialog === 'rules' ? (
          <>
            <div className="eyebrow">EL MACHETE</div>
            <h2>Truco, como acá.</h2>
            <p>
              Baraja española de 40 cartas, equipos alternados, a 15 o 30 puntos. En esta versión
              jugamos sin flor y sin pica-pica.
            </p>
            <h3>Las que mandan</h3>
            <p>
              1 de espadas → 1 de bastos → 7 de espadas → 7 de oros → todos los 3 → los 2 → otros
              ases → 12 → 11 → 10 → otros 7 → 6 → 5 → 4.
            </p>
            <h3>Truco y pardas</h3>
            <p>
              La mano vale 1. Truco: 2; retruco: 3; vale cuatro: 4. Si no se quiere, vale el canto
              anterior. Ganás con dos bazas; si una emparda, la primera ganada decide. Con tres
              pardas gana el equipo mano.
            </p>
            <h3>Envido</h3>
            <p>
              Antes de tirar tu primera carta: dos del mismo palo suman 20 más sus valores; las
              figuras valen cero. Si no hay palo repetido, vale la más alta. En empate gana quien
              sea primero desde la mano. Envido vale 2, real envido 3; los cantos se acumulan. En
              malas, la falta vale lo que le falta al equipo de menor puntaje para terminar; en
              buenas, al de mayor puntaje.
            </p>
            <p>
              Podés cantar envido en respuesta al primer truco. Se resuelve el envido y después se
              responde el truco.
            </p>
            <div className="credits">
              Baraja española de caras catalanas, B. P. Grimaud (1860).{' '}
              <a
                href="https://commons.wikimedia.org/wiki/Category:Modern_Spanish_Catalan_deck_-_Grimaud_-_1860"
                target="_blank"
                rel="noreferrer"
              >
                Colección de la BnF en Wikimedia Commons
              </a>
              . Dominio público. Convertidas a WebP; ilustraciones históricas sin alterar.
            </div>
          </>
        ) : (
          <>
            <div className="eyebrow">VOZ Y CÁMARA</div>
            <h2>Conectar por Discord.</h2>
            <p>
              Creen una llamada grupal o entren al canal de voz que ya usan. Activen la cámara si
              quieren jugar con señas, igual que en una mesa de verdad.
            </p>
            <p>La partida sigue acá. La cámara y el micrófono los maneja Discord.</p>
            {room && (
              <button className="outline" onClick={copyInvite}>
                <Copy size={16} />
                {copied ? 'Copiado' : 'Copiar link de esta mesa'}
              </button>
            )}
            <a
              className="primary discord-open"
              href="https://discord.com/app"
              target="_blank"
              rel="noreferrer"
            >
              Abrir Discord <ArrowUpRight size={18} />
            </a>
          </>
        )}
      </dialog>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
