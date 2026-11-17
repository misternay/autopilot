# @ramenvr/autopilot-browser

Browser/TypeScript plugin for [Autopilot](https://github.com/ramenvr/autopilot) — connects a
PixiJS (or any JavaScript) game running in a browser tab to the Autopilot brain over WebSocket.

---

## Installation

```bash
npm install @ramenvr/autopilot-browser
```

Or add it directly to your game's `package.json`:

```json
{
  "dependencies": {
    "@ramenvr/autopilot-browser": "^0.1.0"
  }
}
```

The presence of `@ramenvr/autopilot-browser` in `dependencies` or `devDependencies` is what
the brain-side `browser.py` engine uses to detect your project automatically.

---

## Usage

### 1. Implement `AutopilotGameApi`

Your game must provide an implementation of `AutopilotGameApi` that exposes the game's state
and input surface to the plugin.

```typescript
import type { AutopilotGameApi } from '@ramenvr/autopilot-browser';

const autopilotApi: AutopilotGameApi = {
  getProjectName: () => 'my-city-game',
  getProjectDir: () => location.href,
  getGameTime: () => myGame.tick,
  isRunning: () => myGame.clock.speed > 0,

  find(query) {
    // Return objects matching query.cls / query.name
    return myGame.findObjects(query);
  },
  getObject(id) {
    return myGame.getObject(id) ?? null;
  },
  setProperty(id, prop, value) {
    return myGame.setProperty(id, prop, value);
  },
  callMethod(id, method, args) {
    return myGame.callMethod(id, method, args);
  },
  describe(id) {
    return myGame.describeObject(id) ?? null;
  },

  getScreen() {
    return myGame.getHudText();
  },
  getUi() {
    return myGame.getUiElements();
  },
  actUi(id, action, params) {
    return myGame.actOnUiElement(id, action, params);
  },

  getView(opts) {
    return myGame.getVisibleObjects(opts);
  },

  getPose() {
    const cam = myGame.camera;
    return {
      at:  { x: cam.cx, y: 0, z: -cam.cy },
      eye: { x: cam.cx, y: 0, z: -cam.cy },
      yaw: 0, pitch: 0,
      velocity: { x: 0, y: 0, z: 0 },
    };
  },
  getMovement() {
    return { speed: 0, max_speed: 0, walk: 0, run: 0, jump: 0, step: 0, air_control: 0 };
  },

  getTransforms(ids) {
    const out: Record<string, { at: { x: number; y: number; z: number }; active: boolean }> = {};
    for (const id of ids) {
      const obj = myGame.getObject(id);
      if (obj) out[id] = { at: { x: obj.x, y: 0, z: -obj.y }, active: true };
    }
    return out;
  },

  keyDown(key) { myGame.input.keyDown(key); },
  keyUp(key) { myGame.input.keyUp(key); },
  keyPress(key) { myGame.input.keyPress(key); },
  inputAction(action, value) { myGame.input.action(action, value); },
  pointerAt(x, y) { myGame.input.pointerAt(x, y); },

  listFiles: () => [],
  getFile: () => null,

  watchObjects(ids, timeoutSeconds) {
    return myGame.watchObjects(ids, timeoutSeconds);
  },
};
```

### 2. Call `createAutopilotPlugin`

```typescript
import { createAutopilotPlugin } from '@ramenvr/autopilot-browser';

const plugin = createAutopilotPlugin({
  projectName: 'my-city-game',
  api: autopilotApi,
  // address: 'ws://127.0.0.1:8765/v1/bridge',  // default
});

// To tear down (e.g. on HMR dispose):
// plugin.destroy();
```

The plugin connects to the Autopilot brain's WebSocket bridge, sends a hello frame, and starts
answering ops. It reconnects automatically if the connection drops.

---

## Brain-side detection

The brain detects a browser project when:

1. `package.json` exists in the project directory, **and**
2. `@ramenvr/autopilot-browser` appears in `dependencies` or `devDependencies`.

Alternatively, set `AUTOPILOT_ENGINE=browser` to force detection regardless of `package.json`.

---

## Engine reference

See [`browser.md`](../../autopilot/engines/browser.md) in the brain-side engine directory for
the full kit reference: object IDs, properties, coordinate system, input actions, and screen
text keys.
