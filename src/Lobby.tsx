import { useState } from 'react';
import { Users, ArrowRight, Lock, Globe, RotateCcw, WifiOff } from 'lucide-react';

export type PublicTable = {
  code: string;
  host: string;
  size: number;
  target: number;
  count: number;
};
type Props = {
  name: string;
  setName: (name: string) => void;
  size: number;
  setSize: (size: number) => void;
  target: number;
  setTarget: (target: number) => void;
  code: string;
  setCode: (code: string) => void;
  tables: PublicTable[];
  connected: boolean;
  busy: boolean;
  command: (data: Record<string, unknown>) => void;
  practice: () => void;
  notify: (message: string) => void;
};

export function Lobby(p: Props) {
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [filter, setFilter] = useState(0);
  const tables = p.tables.filter((table) => filter === 0 || table.size === filter);
  function withName(action: () => void) {
    if (!p.name.trim()) {
      document.getElementById('player-name')?.focus();
      p.notify('Ingresá tu nombre para sentarte a jugar.');
      return;
    }
    action();
  }

  return (
    <main className="lobby">
      <div className="lobby-heading">
        <div className="lobby-title">
          <span className="lobby-eyebrow">UNA MESA SIEMPRE ABIERTA</span>
          <h1><span>Sentate a jugar</span></h1>
          <p>Elegí tu mesa, repartí y jugá.</p>
        </div>
        <span className={`connection-state ${p.connected ? 'online' : ''}`}>
          {p.connected ? (
            <>
              <i />
              Conectado
            </>
          ) : (
            <>
              <WifiOff size={14} />
              Sin conexión
            </>
          )}
        </span>
      </div>
      <div className="lobby-columns">
        <div className="lobby-main">
          <section className="table-browser" aria-labelledby="tables-heading">
            <div className="panel-header">
              <h2 id="tables-heading">
                Mesas públicas <span className="count-badge">{p.tables.length}</span>
              </h2>
              <span className="small-muted">Sin flor</span>
            </div>
            <div className="table-filters" aria-label="Filtrar mesas por jugadores">
              {[
                { size: 0, label: 'Todas' },
                { size: 2, label: '1 vs 1' },
                { size: 4, label: '2 vs 2' },
                { size: 6, label: '3 vs 3' },
              ].map((f) => (
                <button
                  key={f.size}
                  aria-pressed={filter === f.size}
                  className={filter === f.size ? 'active' : ''}
                  onClick={() => setFilter(f.size)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="rooms-list">
              {tables.length ? (
                tables.map((table) => (
                  <div className="room-row" key={table.code}>
                    <div className="mini-table" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="room-info">
                      <strong>Mesa de {table.host}</strong>
                      <span>
                        {table.size / 2} vs {table.size / 2} · {table.target} puntos
                      </span>
                    </div>
                    <div className="room-occupancy">
                      <Users size={15} />
                      <span>
                        {table.count}/{table.size}
                      </span>
                    </div>
                    <button
                      className="primary"
                      disabled={p.busy}
                      onClick={() =>
                        withName(() => p.command({ action: 'join', name: p.name, code: table.code }))
                      }
                    >
                      Sentarme <ArrowRight size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rooms-empty">
                  <div className="empty-seats" aria-hidden="true">
                    <div />
                    <div />
                    <div />
                    <div />
                  </div>
                  <h3>{p.connected ? 'No hay mesas abiertas' : 'No se pudo conectar al servidor'}</h3>
                  <p>
                    {p.connected
                      ? 'Creá una mesa pública para que se sume gente.'
                      : 'Podés jugar contra bots mientras tanto.'}
                  </p>
                </div>
              )}
            </div>
            <div className="browser-footer">
              <span>
                <Users size={14} /> {p.tables.reduce((total, t) => total + t.count, 0)} jugadores en
                mesas abiertas
              </span>
              <span>Actualización en vivo</span>
            </div>
          </section>
          <section className="practice-panel">
            <div className="practice-cards" aria-hidden="true">
              <img src="/cards/espadas-1.webp" alt="" />
              <img src="/cards/bastos-1.webp" alt="" />
              <img src="/cards/oros-7.webp" alt="" />
            </div>
            <div className="practice-info">
              <h2>Jugar contra bots</h2>
              <p>
                Práctica de {p.size / 2} vs {p.size / 2}, a {p.target} puntos.
              </p>
            </div>
            <button className="outline" onClick={p.practice}>
              <RotateCcw size={15} />
              Jugar ahora
            </button>
          </section>
        </div>
        <aside className="create-panel">
          <div className="panel-header">
            <h2>Crear mesa</h2>
            <span className="small-muted">2–6 jugadores</span>
          </div>
          <div className="create-fields">
            <label htmlFor="player-name">Tu nombre</label>
            <input
              id="player-name"
              value={p.name}
              onChange={(e) => p.setName(e.target.value)}
              maxLength={20}
              autoComplete="nickname"
              placeholder="Nombre o apodo"
            />
            <label>Jugadores</label>
            <div className="segmented modes">
              {[2, 4, 6].map((size) => (
                <button
                  key={size}
                  className={p.size === size ? 'active' : ''}
                  aria-pressed={p.size === size}
                  onClick={() => p.setSize(size)}
                >
                  {size / 2} vs {size / 2}
                </button>
              ))}
            </div>
            <label>Puntos</label>
            <div className="segmented points">
              {[15, 30].map((target) => (
                <button
                  key={target}
                  className={p.target === target ? 'active' : ''}
                  aria-pressed={p.target === target}
                  onClick={() => p.setTarget(target)}
                >
                  {target}
                </button>
              ))}
            </div>
            <label>Visibilidad</label>
            <div className="segmented visibility">
              <button
                className={visibility === 'private' ? 'active' : ''}
                aria-pressed={visibility === 'private'}
                onClick={() => setVisibility('private')}
              >
                <Lock size={14} />
                Privada
              </button>
              <button
                className={visibility === 'public' ? 'active' : ''}
                aria-pressed={visibility === 'public'}
                onClick={() => setVisibility('public')}
              >
                <Globe size={14} />
                Pública
              </button>
            </div>
            <p className="field-help">
              {visibility === 'private'
                ? 'Sólo entra quien tenga el código o el link.'
                : 'Aparece en la lista y cualquiera puede entrar.'}
            </p>
            <button
              className="primary create-button"
              disabled={p.busy}
              onClick={() =>
                withName(() =>
                  p.command({
                    action: 'create',
                    name: p.name,
                    size: p.size,
                    target: p.target,
                    public: visibility === 'public',
                  }),
                )
              }
            >
              Crear mesa <ArrowRight size={17} />
            </button>
          </div>
          <form
            className="join-form"
            onSubmit={(e) => {
              e.preventDefault();
              withName(() => p.command({ action: 'join', name: p.name, code: p.code }));
            }}
          >
            <label htmlFor="room-code">Código de invitación</label>
            <div>
              <input
                id="room-code"
                placeholder="Ej.: A3F7C09B2E"
                aria-describedby="room-code-help"
                minLength={6}
                maxLength={10}
                required
                value={p.code}
                onChange={(e) => p.setCode(e.target.value.toUpperCase())}
              />
              <button className="outline" disabled={p.busy}>
                Entrar
              </button>
            </div>
            <p className="join-help" id="room-code-help">
              Pedíselo a quien creó la mesa. También podés entrar desde su link.
            </p>
          </form>
        </aside>
      </div>
    </main>
  );
}
