"""Browser engine: a TypeScript/PixiJS game running in a browser tab.

The plugin (plugin/browser) connects from the page; the brain reads project files from disk
the same way it would for any other engine.

Coordinate mapping (same as Godot 2D):
  browser pixel (x right, y down) → kit (X=x, Y=0, Z=-y)
  1 pixel = 1 cm (kit unit)

A project is detected when package.json exists AND either contains
'@ramenvr/autopilot-browser' in its dependencies, or AUTOPILOT_ENGINE=browser is set.
"""

import json
import os

from ..kit.geom import Vec
from .base import CODEX_OWN, OpEngine, safe_rel

CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json")
SKIP_DIRS = {"node_modules", ".git", "dist", ".vite", "coverage"}


class Browser(OpEngine):
    name = "browser"
    title = "Browser"
    export_dir = None
    plugin_files = ()

    # -- the project on disk -----------------------------------------------------------

    def project_at(self, path):
        """The project folder: a directory containing package.json with the autopilot dep,
        or any directory when AUTOPILOT_ENGINE=browser."""
        if not path:
            return None
        path = os.path.abspath(path)
        folder = os.path.dirname(path) if os.path.isfile(path) else path
        pkg = os.path.join(folder, "package.json")
        if not os.path.isfile(pkg):
            return None
        if os.environ.get("AUTOPILOT_ENGINE", "").strip().lower() == "browser":
            return folder
        try:
            with open(pkg, encoding="utf-8") as f:
                data = json.load(f)
            deps = {}
            deps.update(data.get("dependencies") or {})
            deps.update(data.get("devDependencies") or {})
            if "@ramenvr/autopilot-browser" in deps:
                return folder
        except (OSError, json.JSONDecodeError, ValueError):
            pass
        return None

    def project_name(self, project):
        """name from package.json, else the folder name."""
        try:
            pkg = os.path.join(self.project_folder(project), "package.json")
            with open(pkg, encoding="utf-8") as f:
                data = json.load(f)
            name = (data.get("name") or "").strip()
            if name:
                return name
        except (OSError, json.JSONDecodeError, ValueError):
            pass
        return super().project_name(project)

    # -- the game backend --------------------------------------------------------------

    def all_actors(self, game):
        """The scene's things: find all objects by running the find op with no filter."""
        return list((game.request("find", {}) or {}).get("objects") or [])

    # -- the codex ---------------------------------------------------------------------

    def skip_dir(self, name):
        return name in SKIP_DIRS

    def codex_path(self, rel):
        """TS/TSX/JS/JSX/CSS/HTML/JSON files, excluding skip dirs; kept at their project paths."""
        parts = safe_rel(rel)
        if parts is None:
            return None
        # Skip any path that passes through a skip directory
        for part in parts[:-1]:
            if part in SKIP_DIRS:
                return None
        # Only include recognised code extensions
        if not rel.endswith(CODE_EXT):
            return None
        # Never include autopilot's own codex files
        if os.path.basename(rel) in CODEX_OWN:
            return None
        return rel

    # -- the kit frame -----------------------------------------------------------------

    def to_kit(self, value):
        """Browser pixel (x right, y down) → kit (X=x, Y=0, Z=-y); 1 px = 1 cm."""
        if isinstance(value, dict):
            x = float(value.get("x", 0))
            y = float(value.get("y", 0))
            return Vec(x, 0.0, -y)
        return Vec(0.0, 0.0, 0.0)

    def to_native(self, vec):
        """Kit → browser pixel: x=vec.X, y=-vec.Z."""
        if not isinstance(vec, Vec):
            return {"x": 0.0, "y": 0.0}
        return {"x": vec.x, "y": -vec.z}
