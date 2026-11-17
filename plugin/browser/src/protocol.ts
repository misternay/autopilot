export interface HelloFrame {
  protocol: 1;
  engine: "browser";
  project: string;
  project_dir: string;
  version: string;
  features: string[];
}

export interface RequestFrame {
  id: number;
  op: string;
  [key: string]: unknown;
}

export interface ResponseFrame {
  id: number;
  result?: unknown;
  status?: number;
  error?: string;
}

export type EventType = "heartbeat" | "log" | "finding" | "session" | "usage" | "run_kind";

export interface HeartbeatEvent {
  type: "heartbeat";
  game_time: number;
  fps: number;
}

export interface LogEvent {
  type: "log";
  level: "error" | "warning";
  text: string;
}

export interface FindingEvent {
  type: "finding";
  name: string;
  text: string;
  [key: string]: unknown;
}

export interface SessionEvent {
  type: "session";
  running: boolean;
}

export type PluginEvent = HeartbeatEvent | LogEvent | FindingEvent | SessionEvent;
