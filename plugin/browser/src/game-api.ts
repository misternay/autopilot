export interface GameObject {
  id: string;        // e.g. "building:12", "tile:3456"
  kind: string;      // "building", "tile", "camera", "ui"
  x: number;        // pixel x
  y: number;        // pixel y
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
  distance: number;
  screen_x: number;  // -1..1 from center
  screen_y: number;  // -1..1 from center, y up
  on_screen: boolean;
}

export interface Pose {
  at: { x: number; y: number; z: number };  // kit frame: camera centre
  eye: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  velocity: { x: number; y: number; z: number };
}

export interface Movement {
  speed: number;
  max_speed: number;
  walk: number;
  run: number;
  jump: number;
  step: number;
  air_control: number;
}

export interface AutopilotGameApi {
  // Identity
  getProjectName(): string;
  getProjectDir(): string;
  getGameTime(): number;
  isRunning(): boolean;

  // Objects / scene
  find(query: { cls?: string; name?: string; limit?: number }): GameObject[];
  getObject(id: string): GameObject | null;
  setProperty(id: string, prop: string, value: unknown): boolean;
  callMethod(id: string, method: string, args: Record<string, unknown>): unknown;
  describe(id: string): { cls: string; props: string[]; methods: string[] } | null;

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
  getTransforms(ids: string[]): Record<string, {
    at: { x: number; y: number; z: number };
    active: boolean;
  }>;

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
