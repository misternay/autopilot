import type { RequestFrame } from './protocol.js';
import type { AutopilotGameApi } from './game-api.js';

export type OpResult = unknown;

export interface OpError {
  status: number;
  error: string;
}

function isOpError(e: unknown): e is OpError {
  return typeof e === 'object' && e !== null && 'status' in e && 'error' in e
    && typeof (e as OpError).status === 'number' && typeof (e as OpError).error === 'string';
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

const OPS: Record<string, OpHandler> = {
  ping(_req) {
    return {};
  },

  context(_req, api) {
    return {
      engine: 'browser',
      project: api!.getProjectName(),
      project_dir: api!.getProjectDir(),
      player: 'camera:0',
      controller: '',
      world: 'scene',
    };
  },

  session(req, api) {
    const action = req['action'] as string | undefined ?? 'status';
    if (action === 'status') {
      return { running: api!.isRunning(), game_time: api!.getGameTime() };
    }
    if (action === 'start') {
      api!.inputAction('speed_1x');
      return { running: api!.isRunning(), game_time: api!.getGameTime() };
    }
    if (action === 'stop') {
      api!.inputAction('speed_pause');
      return { running: api!.isRunning(), game_time: api!.getGameTime() };
    }
    throw bad(`unknown session action: ${action}`);
  },

  rc(req, api) {
    const verb = req['verb'] as string | undefined;
    const path = req['path'] as string | undefined ?? '';
    const prop = req['prop'] as string | undefined ?? '';

    if (verb === 'probe') {
      return {};
    }
    if (verb === 'read') {
      const obj = api!.getObject(path);
      if (!obj) throw notFound(`object not found: ${path}`);
      const props = obj.props ?? {};
      if (!Object.hasOwn(props, prop)) throw notFound(`property not found: ${path}.${prop}`);
      const value = props[prop];
      return { result: value !== undefined ? value : null };
    }
    if (verb === 'write') {
      const value = req['value'];
      const ok = api!.setProperty(path, prop, value);
      if (!ok) throw bad(`setProperty failed: ${path}.${prop}`);
      return {};
    }
    if (verb === 'call') {
      const method = req['method'] as string | undefined ?? '';
      const args = (req['args'] != null && typeof req['args'] === 'object' && !Array.isArray(req['args']))
        ? (req['args'] as Record<string, unknown>) : {};
      const result = api!.callMethod(path, method, args);
      return { result: result !== undefined ? result : null };
    }
    if (verb === 'describe') {
      const info = api!.describe(path);
      if (!info) throw notFound(`object not found: ${path}`);
      return info;
    }
    throw bad(`unknown rc verb: ${verb}`);
  },

  screen(_req, api) {
    return api!.getScreen();
  },

  view(req, api) {
    const max_count = (req['max_count'] as number | undefined) ?? 100;
    return { objects: api!.getView({ max_count }) };
  },

  ui(_req, api) {
    return { elements: api!.getUi() };
  },

  act_ui(req, api) {
    const id = (req['element'] as string | undefined) ?? (req['target'] as string | undefined) ?? '';
    const action = req['action'] as string | undefined;
    if (!id) throw bad('act_ui requires an element id');
    const validActions = new Set(['click', 'right_click', 'double_click', 'set', 'drag']);
    if (!action || !validActions.has(action)) throw bad(`unknown act_ui action: ${action}`);
    const params = (req['params'] as { value?: unknown; text?: string; option?: string; to?: string }) ?? {};
    const ok = api!.actUi(id, action as 'click' | 'right_click' | 'double_click' | 'set' | 'drag', params);
    if (!ok) throw bad(`actUi failed: ${id} ${action}`);
    return {};
  },

  async watch(req, api, signal) {
    const ids = (req['objects'] as string[] | undefined) ?? [];
    const seconds = (req['seconds'] as number | undefined) ?? 5;
    const changed = await api!.watchObjects(ids, seconds, signal);
    return { changed };
  },

  key(req, api) {
    const key = req['key'] as string | undefined ?? '';
    const mode = req['mode'] as string | undefined ?? 'press';
    if (mode === 'press') api!.keyPress(key);
    else if (mode === 'down') api!.keyDown(key);
    else if (mode === 'up') api!.keyUp(key);
    else throw bad(`unknown key mode: ${mode}`);
    return {};
  },

  input(req, api) {
    const action = req['action'] as string | undefined ?? '';
    const value = req['value'];
    api!.inputAction(action, value);
    return {};
  },

  find(req, api) {
    const cls = req['cls'] as string | undefined;
    const name = req['name'] as string | undefined;
    const limit = req['limit'] as number | undefined;
    const objects = api!.find({ cls, name, limit }).map((o) => o.id);
    return { objects };
  },

  transforms(req, api) {
    const objects = (req['objects'] as string[] | undefined) ?? [];
    return { transforms: api!.getTransforms(objects) };
  },

  pose(_req, api) {
    return api!.getPose();
  },

  movement(_req, api) {
    return api!.getMovement();
  },

  codex_files(_req, api) {
    return { files: api!.listFiles() };
  },

  codex_read(req, api) {
    const path = req['path'] as string | undefined ?? '';
    const text = api!.getFile(path);
    if (text === null) throw notFound(`file not found: ${path}`);
    return { text };
  },

  pointer(req, api) {
    // req x/y are -1..1 from centre (y up); pass normalized directly to pointerAt
    const nx = (req['x'] as number | undefined) ?? 0;
    const ny = (req['y'] as number | undefined) ?? 0;
    api!.pointerAt(nx, ny);
    return {};
  },
};

export async function dispatchOp(req: RequestFrame, signal?: AbortSignal): Promise<OpResult> {
  if (!Object.hasOwn(OPS, req.op)) throw notFound(`unknown op: ${req.op}`);
  const handler = OPS[req.op];
  const api = NO_API_OPS.has(req.op) ? null : getApi();
  return handler(req, api, signal);
}

export { isOpError };
