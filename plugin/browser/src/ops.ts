import type { RequestFrame } from './protocol.js';
import type { AutopilotGameApi, Vec3 } from './game-api.js';

export type OpResult = unknown;

export interface OpError {
  status: number;
  error: string;
}

function isOpError(e: unknown): e is OpError {
  return typeof e === 'object' && e !== null && 'status' in e && 'error' in e
    && typeof (e as OpError).status === 'number' && typeof (e as OpError).error === 'string';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getArgs(req: RequestFrame): Record<string, unknown> {
  if (isRecord(req.args)) {
    return req.args;
  }
  return req;
}

function toUeVec(v: Vec3 | undefined): { X: number; Y: number; Z: number } | undefined {
  if (!v) return undefined;
  const r = v as Record<string, unknown>;
  return {
    X: Number(r['X'] ?? r['x'] ?? 0),
    Y: Number(r['Y'] ?? r['y'] ?? 0),
    Z: Number(r['Z'] ?? r['z'] ?? 0),
  };
}

function hashText(text: string): string {
  // FNV-1a 32-bit hash as hex for deterministic manifest change detection
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function notFound(msg: string): OpError {
  return { status: 404, error: msg };
}

function bad(msg: string): OpError {
  return { status: 400, error: msg };
}

function getApi(): AutopilotGameApi {
  const api = window.__autopilot__;
  if (!api) throw { status: 503, error: 'window.__autopilot__ not registered' } as OpError;
  return api;
}

type OpHandler = (req: RequestFrame, api: AutopilotGameApi | null, signal?: AbortSignal) => Promise<OpResult> | OpResult;

/** Ops that must work before window.__autopilot__ is registered (brain probes these on connect). */
const NO_API_OPS = new Set(['ping']);

function handleUiAct(req: RequestFrame, api: AutopilotGameApi | null): OpResult {
  const args = getArgs(req);
  const id = (args['id'] as string | undefined)
    ?? (args['element'] as string | undefined)
    ?? (args['target'] as string | undefined)
    ?? '';
  const action = (args['action'] as string | undefined) ?? 'click';
  if (!id) throw bad('ui_act requires an element id');
  const validActions = new Set(['click', 'right_click', 'double_click', 'set', 'drag']);
  if (!validActions.has(action)) throw bad(`unknown ui_act action: ${action}`);
  const nested = isRecord(args['params']) ? args['params'] : {};
  const params = {
    value: nested['value'] ?? args['value'],
    text: (nested['text'] ?? args['text']) as string | undefined,
    option: (nested['option'] ?? args['option']) as string | undefined,
    to: (nested['to'] ?? args['to']) as string | undefined,
  };
  const ok = api!.actUi(id, action as 'click' | 'right_click' | 'double_click' | 'set' | 'drag', params);
  if (!ok) throw bad(`actUi failed: ${id} ${action}`);
  return {};
}

const OPS: Record<string, OpHandler> = {
  ping(_req) {
    return { game_time: window.__autopilot__?.getGameTime() ?? 0 };
  },

  context(_req, api) {
    return {
      engine: 'browser',
      project: api!.getProjectName(),
      project_dir: api!.getProjectDir(),
      player: 'camera:0',
      character: 'camera:0',
      controller: '',
      camera_manager: '',
      world: 'scene',
      game_time: api!.getGameTime(),
    };
  },

  async session(req, api) {
    const args = getArgs(req);
    const action = (args['action'] as string | undefined) ?? 'status';
    if (action === 'status') {
      return { running: api!.isRunning(), game_time: api!.getGameTime() };
    }
    if (action === 'start') {
      if (api!.setPaused) api!.setPaused(false);
      else api!.inputAction('speed_1x');
      return { running: api!.isRunning(), game_time: api!.getGameTime() };
    }
    if (action === 'stop') {
      if (api!.setPaused) api!.setPaused(true);
      else api!.inputAction('speed_pause');
      return { running: api!.isRunning(), game_time: api!.getGameTime() };
    }
    if (action === 'restart') {
      const map = args['map'] as string | undefined;
      if (api!.restart) await api!.restart(map);
      else api!.inputAction('restart', map);
      return { running: api!.isRunning(), game_time: api!.getGameTime() };
    }
    throw bad(`unknown session action: ${action}`);
  },

  pause(req, api) {
    const args = getArgs(req);
    const paused = (args['paused'] as boolean | undefined) ?? true;
    if (api!.setPaused) api!.setPaused(paused);
    else api!.inputAction(paused ? 'speed_pause' : 'speed_1x');
    return { paused };
  },

  rc(req, api) {
    const args = getArgs(req);
    const verb = args['verb'] as string | undefined;
    const body = isRecord(args['body']) ? args['body'] : args;

    if (verb === 'probe') {
      return {};
    }
    if (verb === 'property') {
      const path = (body['objectPath'] as string | undefined) ?? (args['path'] as string | undefined) ?? '';
      const prop = (body['propertyName'] as string | undefined) ?? (args['prop'] as string | undefined) ?? '';
      if (body['access'] === 'WRITE_ACCESS' || 'propertyValue' in body) {
        const pv = body['propertyValue'];
        const value = (isRecord(pv) && prop in pv) ? pv[prop] : pv;
        const ok = api!.setProperty(path, prop, value);
        if (!ok) throw bad(`setProperty failed: ${path}.${prop}`);
        return {};
      }
      const obj = api!.getObject(path);
      if (!obj) throw notFound(`Object ${path} does not exist`);
      const props = obj.props ?? {};
      if (!prop) {
        return { ...props };
      }
      if (!Object.hasOwn(props, prop)) throw notFound(`Property ${path}.${prop} does not exist`);
      const value = props[prop];
      return { [prop]: value !== undefined ? value : null };
    }
    if (verb === 'read') {
      const path = (args['path'] as string | undefined) ?? '';
      const prop = (args['prop'] as string | undefined) ?? '';
      const obj = api!.getObject(path);
      if (!obj) throw notFound(`object not found: ${path}`);
      const props = obj.props ?? {};
      if (!Object.hasOwn(props, prop)) throw notFound(`property not found: ${path}.${prop}`);
      const value = props[prop];
      return { result: value !== undefined ? value : null };
    }
    if (verb === 'write') {
      const path = (args['path'] as string | undefined) ?? '';
      const prop = (args['prop'] as string | undefined) ?? '';
      const value = args['value'];
      const ok = api!.setProperty(path, prop, value);
      if (!ok) throw bad(`setProperty failed: ${path}.${prop}`);
      return {};
    }
    if (verb === 'call') {
      const path = (body['objectPath'] as string | undefined) ?? (args['path'] as string | undefined) ?? '';
      const method = (body['functionName'] as string | undefined) ?? (args['method'] as string | undefined) ?? '';
      const rawArgs = body['parameters'] ?? args['args'];
      const callArgs = isRecord(rawArgs) ? rawArgs : {};
      const info = api!.describe(path);
      if (info?.methods && !Array.isArray(info.methods) && Object.hasOwn(info.methods, method)) {
        const expected = info.methods[method] ?? [];
        const unknown = Object.keys(callArgs).filter((k) => !expected.includes(k));
        if (unknown.length > 0) {
          throw bad(`${method}: unknown argument(s) ${unknown.join(', ')}; it takes ${expected.length ? expected.join(', ') : 'no arguments'}`);
        }
      }
      const result = api!.callMethod(path, method, callArgs);
      const val = result !== undefined ? result : null;
      return { ReturnValue: val, result: val };
    }
    if (verb === 'describe') {
      const path = (body['objectPath'] as string | undefined) ?? (args['path'] as string | undefined) ?? '';
      const info = api!.describe(path);
      if (!info) throw notFound(`Object ${path} does not exist`);
      return {
        Name: info.Name ?? path,
        Class: info.Class ?? info.cls ?? '',
        Properties: info.Properties ?? info.props ?? [],
        Functions: info.Functions ?? info.methods ?? [],
        ...info,
      };
    }
    throw bad(`unknown rc verb: ${verb}`);
  },

  screen(_req, api) {
    const res = api!.getScreen() as unknown;
    if (isRecord(res) && isRecord(res['texts'])) {
      return res;
    }
    return { texts: isRecord(res) ? res : {} };
  },

  view(req, api) {
    const args = getArgs(req);
    const max_count = (args['max_count'] as number | undefined) ?? 100;
    const objects = api!.getView({ max_count }).map((item) => ({
      ...item,
      name: item.name ?? item.id,
      crosshair_on: item.crosshair_on ?? item.on_screen ?? false,
    }));
    return { visible: objects, objects };
  },

  ui(_req, api) {
    return { elements: api!.getUi() };
  },

  ui_act: handleUiAct,
  act_ui: handleUiAct,

  async watch(req, api, signal) {
    const args = getArgs(req);
    const ids = (args['objects'] as string[] | undefined) ?? [];
    const seconds = (args['seconds'] as number | undefined) ?? 5;
    const changed = await api!.watchObjects(ids, seconds, signal);
    return { changed };
  },

  key(req, api) {
    const args = getArgs(req);
    const key = (args['key'] as string | undefined) ?? '';
    const mode = (args['mode'] as string | undefined) ?? 'press';
    if (!key && mode !== 'release_all') return {};
    if (mode === 'press') api!.keyPress(key);
    else if (mode === 'down' || mode === 'hold') api!.keyDown(key);
    else if (mode === 'up' || mode === 'release') api!.keyUp(key);
    else if (mode === 'release_all') api!.keyUp('*');
    else throw bad(`unknown key mode: ${mode}`);
    return {};
  },

  input(req, api) {
    const args = getArgs(req);
    const action = (args['action'] as string | undefined) ?? '';
    if (!action) return {};
    const value = args['value'];
    api!.inputAction(action, value);
    return {};
  },

  find(req, api) {
    const args = getArgs(req);
    const cls = (args['class'] as string | undefined) ?? (args['cls'] as string | undefined);
    const name = args['name'] as string | undefined;
    const limit = args['limit'] as number | undefined;
    const objects = api!.find({ cls, name, limit }).map((o) => o.id);
    return { objects };
  },

  transforms(req, api) {
    const args = getArgs(req);
    const objects = (args['objects'] as string[] | undefined) ?? [];
    const raw = api!.getTransforms(objects);
    const formatted: Record<string, unknown> = {};
    for (const [id, entry] of Object.entries(raw)) {
      if (!entry) {
        formatted[id] = null;
        continue;
      }
      const location = toUeVec(entry.location ?? entry.at);
      const center = toUeVec(entry.center) ?? location;
      const extent = toUeVec(entry.extent) ?? { X: 0, Y: 0, Z: 0 };
      const velocity = toUeVec(entry.velocity) ?? { X: 0, Y: 0, Z: 0 };
      formatted[id] = {
        ...entry,
        location,
        center,
        extent,
        velocity,
        rotation: entry.rotation ?? { Pitch: 0, Yaw: 0, Roll: 0 },
      };
    }
    return { objects: formatted, transforms: raw };
  },

  pose(_req, api) {
    return api!.getPose();
  },

  movement(_req, api) {
    const m = api!.getMovement();
    return {
      ...m,
      ...(m.walk_speed === undefined && (m.walk !== undefined || m.speed !== undefined)
        ? { walk_speed: m.walk ?? m.speed } : {}),
      ...(m.jump_z === undefined && m.jump !== undefined ? { jump_z: m.jump } : {}),
    };
  },

  codex_manifest(_req, api) {
    const paths = api!.listFiles();
    const encoder = new TextEncoder();
    const files = paths.map((p) => {
      const text = api!.getFile(p);
      const size = text !== null ? encoder.encode(text).length : 0;
      const hash = text !== null ? hashText(text) : '';
      return { path: p, size, hash };
    });
    return { project: api!.getProjectName(), files, export: { running: false, ran: true } };
  },

  codex_files(_req, api) {
    return { files: api!.listFiles() };
  },

  codex_read(req, api) {
    const args = getArgs(req);
    if (Array.isArray(args['paths'])) {
      const paths = args['paths'] as string[];
      const maxBytes = (args['max_bytes'] as number | undefined) ?? 1_000_000;
      const files: Record<string, string> = {};
      const missing: string[] = [];
      const too_big: string[] = [];
      let used = 0;
      const encoder = new TextEncoder();
      for (const p of paths) {
        const key = String(p);
        const text = api!.getFile(key);
        if (text === null) {
          missing.push(key);
          continue;
        }
        const size = encoder.encode(text).length;
        if (size > maxBytes) {
          too_big.push(key);
          continue;
        }
        if (used + size > maxBytes) {
          break;
        }
        files[key] = text;
        used += size;
      }
      return { files, missing, too_big };
    }
    const path = (args['path'] as string | undefined) ?? '';
    const text = api!.getFile(path);
    if (text === null) throw notFound(`file not found: ${path}`);
    return { text };
  },

  pointer(req, api) {
    const args = getArgs(req);
    // screen_x/screen_y are -1..1 from centre (y up); pass normalized directly to pointerAt
    const nx = (args['screen_x'] as number | undefined) ?? (args['x'] as number | undefined) ?? 0;
    const ny = (args['screen_y'] as number | undefined) ?? (args['y'] as number | undefined) ?? 0;
    api!.pointerAt(nx, ny);
    const w = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1280;
    const h = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 720;
    return {
      screen_x: nx,
      screen_y: ny,
      x: Math.round((nx + 1) * 0.5 * w),
      y: Math.round((ny + 1) * 0.5 * h),
      on_screen: nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1,
    };
  },
};

export async function dispatchOp(req: RequestFrame, signal?: AbortSignal): Promise<OpResult> {
  if (!Object.hasOwn(OPS, req.op)) throw notFound(`unknown op: ${req.op}`);
  const handler = OPS[req.op];
  const api = NO_API_OPS.has(req.op) ? null : getApi();
  return handler(req, api, signal);
}

export { isOpError };
