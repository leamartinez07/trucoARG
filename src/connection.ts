import type { Match } from './Profile.tsx';
type Reply = { ok: boolean; error?: string; id?: string; code?: string; token?: string; room?: unknown; tables?: unknown; matches?: Match[] };
type Listener = (value?: any) => void;
const key = 'truco-profile-key';
function profileKey() {
  let saved = localStorage.getItem(key);
  if (!saved || !/^[a-f0-9]{64}$/.test(saved)) {
    saved = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(key,saved);
  }
  return saved;
}
// Short HTTP requests let Vercel instances share durable rooms without a pinned connection.
class Connection {
  id = '';
  connected = false;
  private listeners = new Map<string,Listener[]>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private code = '';
  private lastTables = 0;
  on(event: string, fn: Listener) { this.listeners.set(event,[...this.listeners.get(event) || [],fn]); }
  private dispatch(event: string, value?: unknown) { this.listeners.get(event)?.forEach(fn => fn(value)); }
  removeAllListeners() { this.listeners.clear(); }
  connect() { if (this.running) return; this.running = true; void this.poll(); }
  disconnect() { this.running = false; clearTimeout(this.timer); this.connected = false; }
  timeout(_: number) { return this; }
  async request(data?: Record<string,unknown>): Promise<Reply> {
    const response = await fetch('/api/game', data ? { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${profileKey()}` }, body: JSON.stringify({ code:this.code,...data }), signal:AbortSignal.timeout(12000) } : { signal:AbortSignal.timeout(12000) });
    const reply = await response.json() as Reply;
    if (response.status >= 500) throw Error(reply.error || 'Servidor no disponible.');
    if (reply.id) this.id = reply.id;
    if (reply.ok && reply.code) this.code = reply.code;
    if ('room' in reply) { if (reply.room === null) this.code = ''; this.dispatch('room',reply.room); }
    if (reply.tables) this.dispatch('tables',reply.tables);
    return reply;
  }
  emit(_: string, data: Record<string,unknown>, callback: Function) {
    void this.request(data).then(reply => callback.length > 1 ? callback(null,reply) : callback(reply)).catch(error => callback.length > 1 ? callback(error,{ok:false}) : callback({ok:false,error:error.message}));
  }
  private async poll() {
    try {
      if (this.code) {
        const reply = await this.request({action:'poll'});
        if (!reply.ok) { this.code = ''; sessionStorage.removeItem('deuna-session'); this.dispatch('room',null); }
      }
      if (!this.code || Date.now() - this.lastTables > 5000) { await this.request(); this.lastTables = Date.now(); }
      if (!this.connected && this.running) { this.connected = true; this.dispatch('connect'); }
    } catch {
      if (this.connected) { this.connected = false; this.dispatch('disconnect'); }
    }
    if (this.running) this.timer = setTimeout(() => void this.poll(), this.connected ? (this.code ? 1000 : 4000) : 2500);
  }
  exportKey() { return profileKey(); }
  restoreKey(value: string) {
    if (!/^[a-f0-9]{64}$/.test(value.trim())) throw Error('La clave tiene 64 caracteres.');
    localStorage.setItem(key,value.trim());
    sessionStorage.removeItem('deuna-session');
    location.reload();
  }
}
export const connection = new Connection();
