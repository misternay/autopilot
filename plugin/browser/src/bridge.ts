import type { EventsFrame, HelloFrame, RequestFrame, ResponseFrame } from './protocol.js';

type RequestHandler = (frame: RequestFrame) => void;
type CancelFn = () => void;

export class BridgeConnection {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private address: string;
  private hello: HelloFrame;
  private handler: RequestHandler | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  /** Cancellation hooks for in-flight async ops (e.g. watch). Called on disconnect. */
  private cancels = new Set<CancelFn>();

  constructor(address: string, hello: HelloFrame) {
    this.address = address;
    this.hello = hello;
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnect();
    try {
      const ws = new WebSocket(this.address);
      this.ws = ws;

      ws.addEventListener('open', () => {
        this.reconnectDelay = 1000;
        ws.send(JSON.stringify(this.hello));
        this.startHeartbeat();
      });

      ws.addEventListener('message', (event) => {
        let frame: unknown;
        try {
          frame = JSON.parse(event.data as string);
        } catch {
          return;
        }
        if (typeof frame !== 'object' || frame === null) return;
        const f = frame as Record<string, unknown>;
        if ((f['type'] === 'request' || ('id' in f && 'op' in f))
            && typeof f['id'] === 'number' && typeof f['op'] === 'string') {
          this.handler?.(f as RequestFrame);
        }
      });

      ws.addEventListener('close', () => {
        this.stopHeartbeat();
        this.cancelAll();
        this.scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        // close event follows; nothing extra needed
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const api = window.__autopilot__;
      const gameTime = api ? api.getGameTime() : 0;
      this.send({
        type: 'events',
        t: gameTime,
        events: [{ kind: 'heartbeat', t: gameTime, fps: 60, paused: api ? !api.isRunning() : false }],
      });
    }, 1000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private cancelAll(): void {
    for (const cancel of this.cancels) cancel();
    this.cancels.clear();
  }

  /** Register a cancel hook for an in-flight async op. Returns a deregister fn. */
  registerCancel(fn: CancelFn): () => void {
    this.cancels.add(fn);
    return () => this.cancels.delete(fn);
  }

  send(frame: ResponseFrame | EventsFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  onRequest(handler: RequestHandler): void {
    this.handler = handler;
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearReconnect();
    this.stopHeartbeat();
    this.cancelAll();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
