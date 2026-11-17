import { BridgeConnection } from './bridge.js';
import type { AutopilotGameApi } from './game-api.js';
import type { HelloFrame } from './protocol.js';
import { dispatchOp, isOpError } from './ops.js';

export interface PluginOptions {
  /** WebSocket address of the brain bridge. Default: `"ws://127.0.0.1:8765/v1/bridge"` */
  address?: string;
  projectName: string;
  /** Local project directory path on disk, if known. Default: `""` */
  projectDir?: string;
  version?: string;
  api: AutopilotGameApi;
}

export function createAutopilotPlugin(opts: PluginOptions): { destroy(): void } {
  const address = opts.address ?? 'ws://127.0.0.1:8765/v1/bridge';
  const projectDir = opts.projectDir ?? '';

  const hello: HelloFrame = {
    type: 'hello',
    protocol: 1,
    engine: 'browser',
    project: opts.projectName,
    project_dir: projectDir,
    version: opts.version ?? '0.1.0',
    features: [
      'ping', 'context', 'session', 'pause', 'rc', 'screen', 'view', 'ui', 'ui_act', 'act_ui',
      'watch', 'key', 'input', 'find', 'transforms', 'pose', 'movement',
      'codex_manifest', 'codex_files', 'codex_read', 'pointer',
    ],
  };

  // Register the api on the window so ops.ts can reach it
  window.__autopilot__ = opts.api;

  const bridge = new BridgeConnection(address, hello);

  bridge.onRequest(async (req) => {
    const controller = new AbortController();
    const deregister = bridge.registerCancel(() => controller.abort());
    try {
      const result = await dispatchOp(req, controller.signal);
      const t = window.__autopilot__?.getGameTime() ?? 0;
      bridge.send({ type: 'response', id: req.id, ok: true, result, t });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // disconnected; drop
      const t = window.__autopilot__?.getGameTime() ?? 0;
      if (isOpError(e)) {
        bridge.send({ type: 'response', id: req.id, ok: false, status: e.status, error: e.error, t });
      } else {
        bridge.send({ type: 'response', id: req.id, ok: false, status: 500, error: String(e), t });
      }
    } finally {
      deregister();
    }
  });

  bridge.connect();

  return {
    destroy(): void {
      bridge.disconnect();
      if (window.__autopilot__ === opts.api) {
        delete window.__autopilot__;
      }
    },
  };
}
