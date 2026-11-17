export type Vec3 =
  | { x: number; y: number; z: number }
  | { X: number; Y: number; Z: number };

export interface GameObject {
  id: string;        // e.g. "building:12", "tile:3456"
  kind: string;      // "building", "tile", "camera", "ui"
  x: number;         // pixel x
  y: number;         // pixel y
  width?: number;
  height?: number;
  props: Record<string, unknown>;
}

export interface UiElement {
  id: string;
  kind: "button" | "checkbox" | "slider" | "text_input" | "combo" | "widget";
  name: string;
  label: string;
  enabled: boolean;
  checked?: boolean;
  selected?: boolean;
  value?: number | string;
  x: number; y: number; width: number; height: number;
}

export interface ViewObject {
  id: string;
  name?: string;
  distance: number;
  screen_x: number;  // -1..1 from center
  screen_y: number;  // -1..1 from center, y up
  on_screen?: boolean;
  crosshair_on?: boolean;
}

export interface Pose {
  at: Vec3;          // kit frame: camera centre
  eye: Vec3;
  yaw: number;
  pitch: number;
  velocity: Vec3;
  on_ground?: boolean;
}

export interface Movement {
  walk_speed?: number;
  jump_z?: number;
  gravity?: number;
  half_height?: number;
  radius?: number;
  step?: number;
  max_slope?: number;
  air_control?: number;
  // Legacy aliases
  speed?: number;
  max_speed?: number;
  walk?: number;
  run?: number;
  jump?: number;
}

export interface TransformEntry {
  location?: Vec3;
  at?: Vec3;
  center?: Vec3;
  extent?: Vec3;
  rotation?: { Pitch: number; Yaw: number; Roll: number } | Record<string, number>;
  velocity?: Vec3;
  active?: boolean;
}

export interface AutopilotGameApi {
  // Identity
  getProjectName(): string;
  getProjectDir(): string;
  getGameTime(): number;
  isRunning(): boolean;

  // Session control (optional; falls back to inputAction if omitted)
  restart?(map?: string): void | Promise<void>;
  setPaused?(paused: boolean): void;

  // Objects / scene
  find(query: { cls?: string; name?: string; limit?: number }): GameObject[];
  getObject(id: string): GameObject | null;
  setProperty(id: string, prop: string, value: unknown): boolean;
  callMethod(id: string, method: string, args: Record<string, unknown>): unknown;
  describe(id: string): {
    cls?: string;
    props?: string[];
    methods?: string[] | Record<string, string[]>;
    Name?: string;
    Class?: string;
    Properties?: unknown[];
    Functions?: unknown[];
  } | null;

  // Screen text (HUD)
  getScreen(): Record<string, string>;

  // UI elements
  getUi(): UiElement[];
  actUi(id: string, action: "click" | "right_click" | "double_click" | "set" | "drag",
        params: { value?: unknown; text?: string; option?: string; to?: string }): boolean;

  // View (what's visible)
  getView(opts: { max_count?: number }): ViewObject[];

  // Camera pose as "player"
  getPose(): Pose;
  getMovement(): Movement;

  // Transforms of objects
  getTransforms(ids: string[]): Record<string, TransformEntry | null>;

  // Input
  keyDown(key: string): void;
  keyUp(key: string): void;
  keyPress(key: string): void;
  inputAction(action: string, value?: unknown): void;
  /** Normalized screen coords: x/y are -1..1 from centre, y up. */
  pointerAt(nx: number, ny: number): void;

  // Codex: source files the brain reads
  listFiles(): string[];
  getFile(rel: string): string | null;

  // Watch: resolve when any of the named objects change, or timeout.
  // signal: cancelled when the bridge disconnects (AbortError → caller drops response).
  watchObjects(ids: string[], timeoutSeconds: number, signal?: AbortSignal): Promise<boolean>;
}

declare global {
  interface Window {
    __autopilot__?: AutopilotGameApi;
  }
}
