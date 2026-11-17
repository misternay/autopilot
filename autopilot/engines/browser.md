
## The engine: Browser

The browser engine runs autopilot against a TypeScript / PixiJS (or any JS framework) game
running in a browser tab. The plugin (`@ramenvr/autopilot-browser`) is a small ESM module the
game page imports; it connects to the brain's WebSocket bridge and answers the same ops that the
Godot and Unity plugins answer.

---

## Object IDs

Objects are game entities exposed by the game's `AutopilotGameApi` implementation. By
convention, every id is a string with the format `"<kind>:<id>"`:

| id | example meaning |
|----|-----------------|
| `"camera:0"` | the camera itself |
| `"ui:<id>"` | a UI element (button, slider, …) |
| `"tile:3456"` | e.g. a grid tile at index 3456 (city-builder convention: `y × W + x`) |
| `"building:3456"` | e.g. a built-up building on that tile |
| `"facility:3456"` | e.g. a facility anchor on that tile |

---

## Actors

`game.actors(cls)` calls `find` with `{"class": cls}` and returns matching object ids:

```python
game.actors("camera")     # ["camera:0"]
game.actors("ui")         # ids of UI elements
game.actors("building")   # example: ids of tiles that are built-up zones
game.actors("tile")       # example: ids of all map tiles
```

`game.all_actors()` returns all objects (`find` with no filter). `game.named(part)` matches
ids containing `part` case-insensitively (`game.name_of("tile:3456")` is `"tile:3456"`).
Any unknown class returns an empty list.

---

## Reading and writing

```python
# Read a property from a game object
game.get("camera:0", "zoom")         # → zoom factor
game.get("tile:3456", "zone")        # → example: tile property

# Read all properties of a game object
game.props("camera:0")

# Write a property (for verification setup)
game.set("camera:0", "zoom", 2.0, why="zoom in on target area")

# Call a method (parameters passed as keyword arguments)
game.call("tile:3456", "applyZone", zone=1, x0=10, y0=10, x1=15, y1=15)
```

Under the hood these call `window.__autopilot__.getObject(id).props[prop]`,
`window.__autopilot__.setProperty(id, prop, value)` and
`window.__autopilot__.callMethod(id, method, args)`.

### Example: City-builder (`SimState`) properties

In a tile-grid city builder exposing `SimState` typed arrays (index = tile id):

| prop | type | meaning |
|------|------|---------|
| `zone` | 0–3 | None / R / C / I |
| `level` | uint8 | building level |
| `occupants` | uint16 | residents on this tile |
| `access` | uint8 | road-access flags |
| `power` | uint8 | power supply (0 None, 1 Short, 2 Ok) |
| `water` | uint8 | water supply |
| `landValue` | uint8 | 0–255 |
| `happiness` | uint8 | 0–100 (R lots only) |
| `served` | uint8 | bit-field: service k served |
| `traffic` | uint16 | published traffic volume |
| `road` | uint8 | road kind (0 none, 1 two-lane, 2 four-lane, 3 bridge) |
| `terrain` | uint8 | 0 Empty, 1 Water, 2 Forest, 3 Rock |
| `facility` | uint8 | encoded facility |

Camera properties typically include `cx` (centre-x in pixels), `cy` (centre-y in pixels), and
`zoom` (zoom factor).

---

## Coordinate system

The browser plugin uses a 2D pixel coordinate system mapped into the kit frame (1 px = 1 cm):

- X: right (`pixels`)
- Z: up (`-pixelY`)
- Y: always `0` (there is no depth axis)

`game.pose()` returns the camera/player position in the kit frame:

```python
pose = game.pose()
# pose["at"] = Vec(cx_pixels, 0, -cy_pixels)
# pose["yaw"] = 0  (2D top-down camera)
```

`game.to_kit({"x": px, "y": py})` converts a browser pixel position to the kit frame `Vec(px, 0, -py)`.
`game.to_native(vec)` converts a kit `Vec` back to `{"x": vec.x, "y": -vec.z}`.
`game.loc(id)`, `game.locs(ids)`, `game.bounds(id)` and `game.view()` already return kit-frame coordinates.

---

## Input

Key names follow the same FKey convention as the other engines (`W`, `A`, `S`, `D`, `SpaceBar`,
`LeftShift`, `Escape`, `Enter`, `LeftMouseButton`, etc.):

- `game.press(key)` — quick key press
- `game.hold(key)` / `game.release(key)` / `game.release_all()` — held keys
- `game.post("input", {"action": action})` or `game.request("input", {"action": action, "value": value})` — named game input actions
- `game.pointer(screen_x, screen_y)` — move virtual pointer to normalized screen coords (`-1..1` from centre, `+y` up)

Example keys and actions for a 2D city-builder:

| key / action | effect |
|--------------|--------|
| `W` / `A` / `S` / `D` / `ArrowUp`..`ArrowRight` | pan camera |
| `+` / `=` / `-` | zoom in / out |
| `Space` / `"speed_pause"` | pause / unpause |
| `1` / `2` / `4` / `"speed_1x"`, `"speed_2x"`, `"speed_4x"` | set game speed |
| `B`, `V`, `T`, `R`, `C`, `I`, `P`, `L`, `Q`, `U`, `X`, `F`, `G`, `H`, `J`, `N`, `M` | tool hotkeys |
| `"undo"`, `"tool_road"`, `"tool_zone_r"`, `"tool_zone_c"`, `"tool_zone_i"`, `"tool_bulldoze"`, `"tool_inspect"` | named input actions |

---

## Screen text and UI

- `game.screen()` returns a flat `{key: text}` dict of HUD text values (for example `"money"`,
  `"net"`, `"pop"`, `"happiness"`, `"month"`, `"speed"`, `"demand_R"`, `"game_over"`).
- `game.ui()` returns interactive UI elements (`id`, `kind`, `name`, `label`, `enabled`, `x`, `y`,
  `width`, `height`, and state such as `checked`, `selected`, `value`).
- `game.ui_act(id=element_id, action="click")` (or `action="set"`, `value=...`, `text=...`,
  `option=...`, `to=...`) interacts with a UI element.
