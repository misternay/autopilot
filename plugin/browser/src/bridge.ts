import type { HelloFrame, PluginEvent, RequestFrame, ResponseFrame } from './protocol.js';

type RequestHandler = (frame: RequestFrame) => void;
type CancelFn = () => void;

export class BridgeConnection {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
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
        if ('id' in frame) {
          this.handler?.(frame as RequestFrame);
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
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const api = window.__autopilot__;
      const gameTime = api ? api.getGameTime() : 0;
      this.send({ type: 'heartbeat', game_time: gameTime, fps: 60 });
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

  send(frame: ResponseFrame | PluginEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  onRequest(handler: RequestHandler): void {
    this.handler = handler;
  }

  disconnect(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    this.cancelAll();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
