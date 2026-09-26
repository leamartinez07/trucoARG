import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { connection as socket } from './connection.ts';
import { Profile } from './Profile.tsx';
import {
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  Copy,
  Check,
  X,
  Volume2,
  VolumeX,
  Users,
  MessageCircle,
  BookOpen,
  Flag,
  Send,
  LogOut,
  Radio,
  Spade,
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
import type { Game, View, Player, Card, BidName } from '../shared/game.ts';
import './style.css';
import './light.css';
import { Lobby } from './Lobby.tsx';
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
function App() {
  const [size, setSize] = useState(4),
    [target, setTarget] = useState(30),
    [name, setName] = useState(localStorage.getItem('deuna-name') || ''),
    [code, setCode] = useState(new URLSearchParams(location.search).get('mesa') || '');
  const [tables, setTables] = useState<PublicTable[]>([]);
  const [page, setPage] = useState<'tables' | 'profile'>('tables');
  const [room, setRoom] = useState<Room | null>(null),
    [local, setLocal] = useState<View | null>(null),
    [dialog, setDialog] = useState<'rules' | 'discord' | null>(null),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false),
    [sound, setSound] = useState(true),
    [copied, setCopied] = useState(false),
    [chatText, setChatText] = useState(''),
    [showChat, setShowChat] = useState(false);
  const localRef = useRef<Game | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dialogRef = useRef<HTMLDialogElement>(null);
  const g = room?.game ?? local;
  const inTable = Boolean(room || local);
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
    if (!local) return;
    const timer = setInterval(() => {
      const game = localRef.current;
      if (game && botStep(game)) {
        setLocal(view(game, 0));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [Boolean(local)]);
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
    const players: Player[] = Array.from({ length: size }, (_, i) => ({
      id: `local-${i}`,
      name: i === 0 ? name.trim() || 'Vos' : ['Tito', 'La Negra', 'Rolo', 'Luli', 'Cacho'][i - 1],
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
    setShowChat(false);
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
  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="wordmark"
          onClick={() => {
            if (inTable) leave();
          }}
          aria-label="Truco argentino, inicio"
        >
          <span className="arg-flag" />
          <strong>TRUCO</strong>
          <span className="brand-sub">ARGENTINO</span>
        </button>
        <nav>
          <button
            className={!inTable ? 'nav-active' : ''}
            onClick={() => {
              if (inTable) leave();
              setPage('tables');
            }}
          >
            Mesas
          </button>
          <button className={page === 'profile' ? 'nav-active' : ''} onClick={() => setPage('profile')}>Mi perfil</button>
          <button aria-label="Reglas" onClick={() => setDialog('rules')}>
            <BookOpen size={16} />
            <span>Reglas</span>
          </button>
        </nav>
        <div className="header-tools">
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
            onClick={() => setSound(!sound)}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </header>
      {page === 'profile' ? <Profile name={name} notify={notify} /> : !inTable ? (
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
          <div className="game-layout">
            <section className="table-wrap">
              <div className="table-top">
                <span>
                  <i />
                  {local ? 'PRÁCTICA LOCAL' : connected ? 'MESA CONECTADA' : 'RECONECTANDO…'}
                </span>
                <span>
                  {g ? `MANO ${String(g.round).padStart(2, '0')}` : 'ESPERANDO A LA BANDA'}
                </span>
              </div>
              <div className={`playing-table seats-${g?.players.length ?? room?.size ?? size}`}>
                {g ? (
                  <>
                    <div className="table-watermark">
                      de una<span>TRUCO ARGENTINO</span>
                    </div>
                    {g.players.map((p, i) => {
                      const relative = (i - g.seat + g.players.length) % g.players.length;
                      return (
                        <div
                          key={p.id}
                          className={`seat seat-${relative} ${g.turn === i && g.status === 'playing' ? 'seat-turn' : ''} ${relative === 0 ? 'self-seat' : ''}`}
                        >
                          <div className={`avatar team-${p.team}`}>
                            {p.name.slice(0, 1).toUpperCase()}
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
                    <div className="played-cards">
                      {g.table.map((p, i) => (
                        <div
                          key={`${g.round}-${p.seat}-${p.card.id}`}
                          className="played"
                          style={{ transform: `rotate(${((i % 3) - 1) * 9}deg)` }}
                        >
                          <CardFace card={p.card} />
                          <span>{g.players[p.seat].name}</span>
                        </div>
                      ))}
                    </div>
                    {g.table.length === 0 && (
                      <div className="table-center-message">
                        <Spade size={24} />
                        <span>
                          {g.bid
                            ? 'Hay un canto en la mesa.'
                            : g.status === 'playing'
                              ? 'Recién repartidas.'
                              : 'Terminó la mano.'}
                        </span>
                      </div>
                    )}
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
                            if (sound) {
                              try {
                                const ctx = new AudioContext();
                                const osc = ctx.createOscillator();
                                const gain = ctx.createGain();
                                osc.connect(gain);
                                gain.connect(ctx.destination);
                                osc.frequency.value = 440;
                                gain.gain.setValueAtTime(0.035, ctx.currentTime);
                                gain.gain.exponentialRampToValueAtTime(
                                  0.001,
                                  ctx.currentTime + 0.08,
                                );
                                osc.start();
                                osc.stop(ctx.currentTime + 0.08);
                                osc.onended = () => void ctx.close();
                              } catch {}
                            }
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
              {g && (
                <div className="game-actions">
                  {g.status !== 'playing' ? (
                    <>
                      <span>{g.message}</span>
                      {g.status === 'round-end' && (local || g.seat === 0) && (
                        <button className="primary" onClick={() => command({ action: 'next' })}>
                          Siguiente mano <ArrowRight size={17} />
                        </button>
                      )}
                      {g.status === 'finished' && (
                        <button className="primary" onClick={leave}>
                          Volver al club <ArrowRight size={17} />
                        </button>
                      )}
                    </>
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
                        <button
                          className="call"
                          onClick={() => command({ action: 'bid', name: 'falta envido' })}
                        >
                          Falta envido
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="bid-buttons">
                        {(['envido', 'real envido', 'falta envido'] as BidName[]).map((b) => (
                          <button
                            key={b}
                            className="call"
                            disabled={
                              !(!g.envidoDone && g.tricks.length === 0 && g.hand.length === 3) ||
                              Boolean(g.bid)
                            }
                            onClick={() => command({ action: 'bid', name: b })}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                      <div className="bid-divider" />
                      <button
                        className="primary truco-call"
                        disabled={
                          Boolean(g.bid) ||
                          g.stake >= 4 ||
                          (g.raiseTeam !== null && g.raiseTeam !== ownTeam)
                        }
                        onClick={() => command({ action: 'bid', name: nextBid })}
                      >
                        ¡{nextBid}!
                      </button>
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
            </section>
            <aside className="score-sidebar">
              <div className="scoreboard">
                <div className="sidebar-title">
                  <span>EL ANOTADOR</span>
                  <span>✦</span>
                </div>
                <div className="scores">
                  <div>
                    <span>Nosotros</span>
                    <strong>{currentScore[ownTeam]}</strong>
                  </div>
                  <span className="score-slash">/</span>
                  <div>
                    <span>Ellos</span>
                    <strong>{currentScore[1 - ownTeam]}</strong>
                  </div>
                </div>
                <div className="score-progress">
                  {currentScore.map((_, team) => (
                    <div key={team}>
                      <span
                        style={{
                          width: `${Math.min(100, (currentScore[team] / (g?.target ?? target)) * 100)}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="score-footer">
                  <span>
                    {Math.max(...currentScore) >= (g?.target ?? target) / 2
                      ? 'EN LAS BUENAS'
                      : 'EN LAS MALAS'}
                  </span>
                  <span>A {g?.target ?? target}</span>
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
              {room && (
                <button className="chat-toggle" onClick={() => setShowChat(!showChat)}>
                  <MessageCircle size={16} />
                  Chat de la mesa
                  <ChevronDown size={15} />
                </button>
              )}
              {showChat && room && (
                <div className="chat-panel">
                  <div className="chat-messages" aria-live="polite">
                    {room.chat.length ? (
                      room.chat.map((m, i) => (
                        <p key={i}>
                          <strong>{m.name}: </strong>
                          {m.text}
                        </p>
                      ))
                    ) : (
                      <p>Todavía no hay mensajes.</p>
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      command({ action: 'chat', text: chatText });
                      setChatText('');
                    }}
                  >
                    <input
                      aria-label="Mensaje para la mesa"
                      value={chatText}
                      maxLength={180}
                      onChange={(e) => setChatText(e.target.value)}
                      placeholder="Decí algo…"
                    />
                    <button aria-label="Enviar mensaje">
                      <Send size={16} />
                    </button>
                  </form>
                </div>
              )}
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
              Cartas de{' '}
              <a
                href="https://commons.wikimedia.org/wiki/User:Basquetteur"
                target="_blank"
                rel="noreferrer"
              >
                Basquetteur
              </a>
              , vectorizadas por{' '}
              <a
                href="https://github.com/gjenkins20/spanish-playing-cards-svg"
                target="_blank"
                rel="noreferrer"
              >
                gjenkins20
              </a>
              .{' '}
              <a
                href="https://creativecommons.org/licenses/by-sa/3.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-SA 3.0
              </a>
              . Convertidas a WebP; ilustraciones sin alterar.
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
