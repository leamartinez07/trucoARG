import { useEffect, useState } from 'react';
import { ArrowLeft, Download, History, Users } from 'lucide-react';
import { connection } from './connection.ts';
import type { Player, Card } from '../shared/game.ts';
export type Match = { id:string; code:string; started:number; finished:number; size:number; target:number; players:Player[]; scores:number[]; winner:number; rounds:{number:number;hands:Card[][]}[]; actions:{at:number;round:number;seat:number;action:string;detail:string;message:string}[] };
export function Profile({name,notify}: {name:string;notify:(message:string)=>void}) {
  const [matches,setMatches] = useState<Match[]>([]), [selected,setSelected] = useState<Match|null>(null), [loading,setLoading] = useState(true), [error,setError] = useState(''), [restore,setRestore] = useState('');
  useEffect(() => { let alive = true; connection.request({action:'history'}).then(r => { if (alive) { if (!r.ok) setError(r.error || 'No se pudo cargar el historial.'); else setMatches(r.matches || []); } }).catch(() => { if (alive) setError('No se pudo cargar el historial.'); }).finally(() => { if (alive) setLoading(false); }); return () => {alive=false;}; },[]);
  const ownTeam = (m:Match) => m.players.find(p => p.id === connection.id)?.team ?? -1;
  const wins = matches.filter(m => m.winner === ownTeam(m)).length;
  const rivals = new Map<string,{name:string;games:number;wins:number}>();
  matches.forEach(m => m.players.filter(p => !p.bot && p.team !== ownTeam(m)).forEach(p => {const previous=rivals.get(p.id) || {name:p.name,games:0,wins:0}; previous.games++; previous.wins += Number(m.winner === ownTeam(m)); rivals.set(p.id,previous);}));
  function backup() {
    const blob = new Blob([connection.exportKey()],{type:'text/plain'}), url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url;a.download='mi-perfil-truco.txt';a.click();URL.revokeObjectURL(url);notify('Guardá la clave en privado: permite recuperar tu perfil.');
  }
  return <main className="profile-page">
    <div className="lobby-heading"><h1>{selected ? 'Detalle de partida' : name.trim() || 'Mi perfil'}</h1><span className="small-muted">Historial personal</span></div>
    {selected ? <>
      <button className="back-link" onClick={()=>setSelected(null)}><ArrowLeft size={16}/>Volver al historial</button>
      <section className="profile-panel"><h2>{selected.players.filter(p=>p.team===0).map(p=>p.name).join(' + ')} <b>{selected.scores.join(' – ')}</b> {selected.players.filter(p=>p.team===1).map(p=>p.name).join(' + ')}</h2><p>{new Date(selected.finished).toLocaleString('es-AR')} · {selected.size/2} vs {selected.size/2} · a {selected.target}</p></section>
      {selected.rounds.map(round=><section className="profile-panel" key={round.number}><h2>Mano {round.number}</h2><div className="history-hands">{round.hands.map((hand,seat)=><div key={seat}><strong>{selected.players[seat].name}</strong><div>{hand.map(card=><img key={card.id} src={`/cards/${card.id}.webp`} alt={`${card.value} de ${card.suit}`}/>)}</div></div>)}</div><ol className="history-actions">{selected.actions.filter(a=>a.round===round.number).map((a,i)=><li key={i}><strong>{selected.players[a.seat]?.name}</strong><span>{a.action==='play' ? `Tiró ${a.detail.replace('-',' de ')}` : a.action==='bid' ? `Cantó ${a.detail}` : a.action==='answer' ? a.detail : a.action==='fold' ? 'Se fue al mazo' : 'Repartió'}{a.action!=='play' && a.message ? ` · ${a.message}` : ''}</span></li>)}</ol></section>)}
    </> : <>
      <div className="profile-stats"><div><strong>{matches.length}</strong><span>Partidas</span></div><div><strong>{wins}</strong><span>Ganadas</span></div><div><strong>{matches.length-wins}</strong><span>Perdidas</span></div></div>
      <section className="profile-panel"><h2><History size={17}/> Partidas terminadas</h2>{loading ? <p>Cargando historial…</p> : error ? <p role="alert">{error}</p> : matches.length ? matches.map(m=><button className="history-row" key={m.id} onClick={()=>setSelected(m)}><span className={m.winner===ownTeam(m)?'result-win':'result-loss'}>{m.winner===ownTeam(m)?'Ganaste':'Perdiste'}</span><span><strong>{m.players.map(p=>p.name).join(' · ')}</strong><small>{new Date(m.finished).toLocaleDateString('es-AR')} · {m.size/2} vs {m.size/2}</small></span><b>{m.scores.join(' – ')}</b><span>Ver jugadas →</span></button>) : <p>Todavía no terminaste ninguna partida online. Las prácticas locales no se guardan.</p>}</section>
      {rivals.size>0 && <section className="profile-panel"><h2><Users size={17}/> Entre nosotros</h2>{[...rivals.values()].map((r,i)=><div className="rival-row" key={i}><strong>{r.name}</strong><span>{r.games} partidas · {r.wins} ganadas · {r.games-r.wins} perdidas</span></div>)}</section>}
      <details className="profile-panel"><summary>Guardar o recuperar mi perfil</summary><p>Tu perfil se reconoce en este navegador. Descargá tu clave privada para recuperarlo en otro dispositivo o si borrás los datos. No la compartas con otros jugadores.</p><button className="outline" onClick={backup}><Download size={15}/>Guardar clave</button><form className="profile-restore" onSubmit={e=>{e.preventDefault();try{connection.restoreKey(restore);}catch(error){notify((error as Error).message);}}}><label htmlFor="restore-profile">Clave de otro perfil</label><input id="restore-profile" type="password" autoComplete="off" value={restore} onChange={e=>setRestore(e.target.value)} minLength={64} maxLength={64} required/><button className="outline">Recuperar perfil</button></form></details>
    </>}
  </main>;
}
