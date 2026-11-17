export interface HelloFrame {
  type: "hello";
  protocol: 1;
  engine: "browser";
  project: string;
  project_dir: string;
  version: string;
  features: string[];
}

export interface RequestFrame {
  type?: "request";
  id: number;
  op: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResponseFrame {
  type: "response";
  id: number;
  ok: boolean;
  result?: unknown;
  status?: number;
  error?: string;
  t?: number;
}

export type EventType = "heartbeat" | "log" | "finding" | "session" | "usage" | "run_kind";

export interface HeartbeatEvent {
  kind: "heartbeat";
  t?: number;
  fps: number;
  paused?: boolean;
}

export interface LogEvent {
  kind: "log";
  t?: number;
  level?: "error" | "warning";
  verbosity?: string;
  message: string;
}

export interface FindingEvent {
  kind: "finding";
  t?: number;
  finding: {
    detector: string;
    summary: string;
    signature?: string;
    [key: string]: unknown;
  };
}

export interface SessionEvent {
  kind: "session";
  t?: number;
  running: boolean;
}

export type PluginEvent = HeartbeatEvent | LogEvent | FindingEvent | SessionEvent;

export interface EventsFrame {
  type: "events";
  t: number;
  events: PluginEvent[];
}
