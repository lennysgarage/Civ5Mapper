"""Installed style presets and backward-compatible JSON file selection."""
import json
from importlib import resources
from pathlib import Path


PRESETS = {
    'atlas': 'Colorful political atlas with mountains, forests and defined borders.',
    'parchment': 'Warm parchment colors with muted oceans and brown outlines.',
    'minimalist': 'Light oceans and thin borders, without mountain or forest icons.',
}


def style_path(selection):
    """Return a file input only for custom styles, for output-path protection."""
    return Path(selection) if selection is not None and str(selection) not in PRESETS else None


def load_style(selection=None):
    if selection is None:
        return None
    name = str(selection)
    if name in PRESETS:
        text = resources.files('civmapper').joinpath('styles', name + '.json').read_text(encoding='utf-8')
    else:
        path = Path(selection)
        if not path.is_file():
            raise ValueError(f'unknown style or missing JSON file: {selection}; styles: {", ".join(PRESETS)}')
        text = path.read_text(encoding='utf-8')
    style = json.loads(text)
    if not isinstance(style, dict):
        raise ValueError('style JSON must be an object')
    return style
