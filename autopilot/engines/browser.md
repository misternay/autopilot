# Browser Engine

The browser engine runs autopilot against a TypeScript / PixiJS (or any JS framework) game
running in a browser tab. The plugin (`@ramenvr/autopilot-browser`) is a small ESM module the
game page imports; it connects to the brain's WebSocket bridge and answers the same ops that the
Godot and Unity plugins answer.

---

## Object IDs

Objects are game entities. Every id is a string with the format `"<kind>:<index>"`:

| id | meaning |
|----|---------|
| `"tile:3456"` | grid tile at index 3456 (y × W + x in a 128 × 128 map) |
| `"building:3456"` | same tile, accessed as a building (zone + level > 0) |
| `"facility:3456"` | same tile, accessed as a facility anchor |
| `"camera:0"` | the camera itself |
| `"ui:<id>"` | a UI element (button, slider, …) |

---

## Actors

```python
game.actors("building")   # ids of all tiles that are built-up zones
game.actors("tile")       # ids of all 128×128 = 16 384 tiles
game.actors("camera")     # ["camera:0"]
game.actors("facility")   # ids of tiles with a facility anchor
```

The browser plugin answers `find` to supply these lists.

---

## Reading and writing

```python
# Read a property from a game object
game.get("tile:3456", "zone")        # → zone enum value (0 None, 1 R, 2 C, 3 I)
game.get("camera:0", "cx")           # → camera centre-x in pixels
game.get("tile:3456", "happiness")   # → 0..100

# Write a property
game.set("camera:0", "zoom", 2.0)

# Call a method
game.call("tile:3456", "applyZone", {"zone": 1, "x0": 10, "y0": 10, "x1": 15, "y1": 15})
```

Under the hood these call `window.__autopilot__.getObject(id).props[prop]`,
`window.__autopilot__.setProperty(id, prop, value)` and
`window.__autopilot__.callMethod(id, method, args)`.

Tile properties (from `SimState` typed arrays, index = tile id):

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

Camera properties:

| prop | meaning |
|------|---------|
| `cx` | centre-x in screen pixels |
| `cy` | centre-y in screen pixels |
| `zoom` | zoom factor |

---

## Coordinate system

The browser plugin uses a 2D coordinate system:

- X: right (pixels)
- Z: up (negated Y: Z = −pixelY)
- Y: always 0 (there is no depth axis)

`game.pose()` returns the camera centre as the "player position" in the kit frame:

```python
pose = game.pose()
# pose["at"] = {"x": cx_pixels, "y": 0, "z": -cy_pixels}
# pose["yaw"] = 0  (top-down camera has no meaningful yaw)
```

`game.to_kit({"x": px, "y": py})` converts a browser pixel position to the kit frame.
`game.to_native(vec)` converts back.

---

## Input

Key names follow the same FKey convention as the other engines:

| key | effect |
|-----|--------|
| `W` / `ArrowUp` | pan camera up |
| `S` / `ArrowDown` | pan camera down |
| `A` / `ArrowLeft` | pan camera left |
| `D` / `ArrowRight` | pan camera right |
| `+` / `=` | zoom in |
| `-` | zoom out |
| `Space` | pause / unpause |
| `1` / `2` / `4` | set game speed |

Tool hotkeys (press to select a tool):

| key | tool |
|-----|------|
| `B` | road |
| `V` | widen road (4-lane) |
| `T` | bridge |
| `R` | zone residential |
| `C` | zone commercial |
| `I` | zone industrial |
| `P` | power plant |
| `L` | power line |
| `Q` | water pump |
| `U` | water pipe |
| `X` | bulldoze |
| `F` | clear forest |
| `G` | park |
| `H` | clinic |
| `J` | school |
| `N` | police station |
| `M` | fire station |

City-specific input actions (use `game.input_action(action)`):

| action | effect |
|--------|--------|
| `"speed_pause"` | set speed to 0 (pause) |
| `"speed_1x"` | set speed to 1× |
| `"speed_2x"` | set speed to 2× |
| `"speed_4x"` | set speed to 4× |
| `"undo"` | undo last command |
| `"tool_road"` | select road tool |
| `"tool_zone_r"` | select residential zone tool |
| `"tool_zone_c"` | select commercial zone tool |
| `"tool_zone_i"` | select industrial zone tool |
| `"tool_bulldoze"` | select bulldoze tool |
| `"tool_inspect"` | select inspect tool |

---

## Screen text

`game.screen()` returns a flat dict of HUD text values:

| key | value |
|-----|-------|
| `"money"` | formatted cash (e.g. `"฿ 12,345"`) |
| `"net"` | monthly income − upkeep (e.g. `"+฿ 230/เดือน"`) |
| `"pop"` | population (e.g. `"1,234"`) |
| `"happiness"` | city happiness 0–100 (or `"—"` before anyone moves in) |
| `"month"` | current month number |
| `"speed"` | current game speed (0, 1, 2, or 4) |
| `"demand_R"` | zone R demand value |
| `"demand_C"` | zone C demand value |
| `"demand_I"` | zone I demand value |
| `"tax_R"` | zone R tax % |
| `"tax_C"` | zone C tax % |
| `"tax_I"` | zone I tax % |
| `"runway"` | runway band text (financial health) |
| `"game_over"` | `""` or `"bankrupt"` / `"victory"` |

---

## UI elements

`game.ui()` returns toolbar buttons, speed controls, tax sliders, service-budget controls and
any other interactive element the HUD exposes. Use `game.act_ui(id, action, params)` to click
or set a value.

---

## Classes / kinds

When the brain calls `game.actors(cls)` the browser plugin maps `cls` to a kind:

- `"tile"` → all 16 384 tiles
- `"building"` → tiles with zone ≥ 1 and level ≥ 1
- `"facility"` → tiles with a facility anchor
- `"camera"` → `["camera:0"]`
- `"ui"` → all UI elements (same as `game.ui()`)

Any unknown class returns an empty list.
