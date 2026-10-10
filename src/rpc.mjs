import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';

export class CodexRPC extends EventEmitter {
  constructor(command = 'codex', args = ['app-server','--listen','stdio://']) { super(); this.command = command; this.args = args; this.pending = new Map(); this.sequence = 0; this.connected = false; this.starting = null; }
  async start() {
    if (this.connected) return;
    if (this.starting) return this.starting;
    this.starting = this.connect();
    try { await this.starting; } finally { this.starting = null; }
  }
  async connect() {
    this.proc = spawn(this.command, this.args, { stdio: ['pipe','pipe','pipe'], windowsHide: true });
    const proc = this.proc;
    proc.stdin.on('error', e => this.emit('diagnostic', e.message));
    proc.stderr.on('data', b => this.emit('diagnostic', b.toString().slice(-4000)));
    const fail = error => {
      if (this.proc !== proc) return;
      this.connected = false;
      for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
      this.pending.clear(); this.emit('disconnect', error.message);
    };
    proc.on('error', fail); proc.on('exit', (code, signal) => fail(new Error(`Codex app-server exited (${code ?? signal})`)));
    createInterface({ input: proc.stdout }).on('line', line => {
      if(this.proc!==proc) return;
      let msg; try { msg = JSON.parse(line); } catch { this.emit('diagnostic', line.slice(0,1000)); return; }
      if (msg.method) { this.emit(msg.id !== undefined ? 'request' : 'notification', msg); return; }
      const item = this.pending.get(msg.id);
      if (!item) return;
      clearTimeout(item.timer); this.pending.delete(msg.id);
      if (msg.error) item.reject(Object.assign(new Error(msg.error.message), {code:msg.error.code,data:msg.error.data,rpcRejected:true})); else item.resolve(msg.result);
    });
    await this.call('initialize', { clientInfo: { name:'personal_codex_automation', title:'Personal Codex Automation', version:'0.1.0' } });
    this.notify('initialized', {}); this.connected = true;
  }
  send(msg) { if (!this.proc?.stdin.writable) throw new Error('Codex connection unavailable'); this.proc.stdin.write(JSON.stringify(msg)+'\n'); }
  call(method, params = {}, timeout = 60000) {
    const id = ++this.sequence;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`RPC timeout: ${method}; execution outcome may be unknown`)); }, timeout);
      this.pending.set(id, {resolve,reject,timer});
      try { this.send({id,method,params}); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  notify(method,params) { this.send({method,params}); }
  respond(id,result) { this.send({id,result}); }
  reject(id,message) { this.send({id,error:{code:-32601,message}}); }
  stop() { this.proc?.kill(); this.connected = false; }
}
