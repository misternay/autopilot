import { BridgeConnection } from './bridge.js';
import type { AutopilotGameApi } from './game-api.js';
import type { HelloFrame } from './protocol.js';
import { dispatchOp, isOpError } from './ops.js';

export interface PluginOptions {
  /** WebSocket address of the brain bridge. Default: `"ws://127.0.0.1:8765/v1/bridge"` */
  address?: string;
  projectName: string;
  /** Default: `location.href` */
  projectDir?: string;
  version?: string;
  api: AutopilotGameApi;
}

export function createAutopilotPlugin(opts: PluginOptions): { destroy(): void } {
  const address = opts.address ?? 'ws://127.0.0.1:8765/v1/bridge';
  const projectDir = opts.projectDir ?? location.href;

  const hello: HelloFrame = {
    protocol: 1,
    engine: 'browser',
    project: opts.projectName,
    project_dir: projectDir,
    version: opts.version ?? '0.1.0',
    features: [
      'ping', 'context', 'session', 'rc', 'screen', 'view', 'ui', 'act_ui',
      'watch', 'key', 'input', 'find', 'transforms', 'pose', 'movement',
      'codex_files', 'codex_read', 'pointer',
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
      bridge.send({ id: req.id, result });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // disconnected; drop
      if (isOpError(e)) {
        bridge.send({ id: req.id, status: e.status, error: e.error });
      } else {
        bridge.send({ id: req.id, status: 500, error: String(e) });
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
