"""Offline HTML viewer built from deterministic SVGs and normalized world data."""
import html
import json
from importlib.resources import files

from .render import render_svg, army_groups, empire_label, DEFAULT_STYLE, PALETTE
from .military import military_summary, ROLE_LABELS


def script_json(value):
    # HTML parsers recognize </script> even inside JSON strings.
    return (json.dumps(value,ensure_ascii=True,sort_keys=True,separators=(',',':'))
            .replace('&','\\u0026').replace('<','\\u003c').replace('>','\\u003e'))


def player_control(civ):
    """Default display cohorts use current control or a retained player nickname.

    Nicknames can also survive lobby-only occupancy; this is a display heuristic,
    not proof that a human played a particular turn.
    """
    if civ['kind']!='major':return 'other'
    slot=civ.get('setupSlotStatus')
    name=civ.get('playerName')
    if isinstance(name,str) and name.strip():return 'human'
    if type(slot) is not int:return 'unknown'
    return {1:'ai',3:'human'}.get(slot,'unknown')


def render_html(world, style=None, *, mode='political'):
    # An HTML document includes several modes. Army-only presentation settings
    # apply to its army variant even when the initial view is political.
    primary=dict(style or {})
    if mode!='army':primary.update(armyIcons='domain',showMilitarySummary=False)
    render_svg(world,primary,mode=mode)
    ids=[str(c['id']) for c in world['cities']]
    if len(set(ids))!=len(ids):
        raise ValueError('HTML export requires unique city IDs')
    config=dict(DEFAULT_STYLE,**(style or {}))
    variants={}; unavailable={}
    for view in ('political','physical','army'):
        settings=dict(config)
        # Generate toggleable layers; controls retain the user's initial settings.
        for key in ('showCities','showRoads','showRivers','showCivilizationNames'):
            settings[key]=True
        settings['showMilitarySummary']=False # HTML summary lives in the sidebar.
        if view!='army':settings['armyIcons']='domain'
        try:variants[view]=render_svg(world,settings,mode=view,interactive=True)
        except ValueError as error:unavailable[view]=str(error)
    groups=army_groups(world) if 'army' in variants else None
    summary=military_summary(world['civilizations'],groups) if groups is not None else None
    colors={}; labels={}
    for index,civ in enumerate(sorted(world['civilizations'],key=lambda c:c['id'])):
        colors[str(civ['id'])]=config['colorOverrides'].get(str(civ['id'])) or civ.get('color') or PALETTE[index%len(PALETTE)]
        labels[str(civ['id'])]=empire_label(civ,config['empireLabels'])
    data={key:world[key] for key in ('schemaVersion','source','game','extraction')}
    data['civilizations']=sorted(world['civilizations'],key=lambda c:c['id'])
    data['tiles']=sorted(world['tiles'],key=lambda t:(t['y'],t['x']))
    data['cities']=sorted(world['cities'],key=lambda c:str(c['id']))
    if world.get('units') is not None:
        data['units']=sorted(world['units'],key=lambda u:(u['owner'],str(u['id'])))
    payload={'world':data,'mode':mode,'unavailable':unavailable,'summary':summary,
             'playerControls':{str(c['id']):player_control(c) for c in data['civilizations']},
             'labels':labels,'colors':colors,'roleLabels':ROLE_LABELS,
             'layers':{'armies':True,'cities':config['showCities'],'roads':config['showRoads'],
                       'rivers':config['showRivers'],'cityLabels':config['showCities'],
                       'empireLabels':config['showCivilizationNames']},
             'expandSummary':config['showMilitarySummary']}
    title='CivMapper · '+('Synthetic demo' if world['source']['kind']=='synthetic' else f'Turn {world["game"].get("turn","?")}')
    assets=files('civmapper').joinpath('web')
    css=assets.joinpath('viewer.css').read_text(encoding='utf-8')
    js=assets.joinpath('viewer.js').read_text(encoding='utf-8')
    templates='\n'.join(f'<template id="map-{view}">{svg}</template>' for view,svg in variants.items())
    options=''.join(f'<option value="{view}"'+(' disabled' if view not in variants else '')+f'>{label}</option>'
                    for view,label in [('political','Political'),('physical','Physical terrain'),('army','Army')])
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><style>{css}</style></head>
<body><header><div><strong>CivMapper</strong><span>{html.escape(title.split(' · ',1)[1])}</span></div>
<label>View <select id="mode">{options}</select></label>
<nav aria-label="Map navigation"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit">Fit map</button><button id="export-png">Export PNG</button></nav></header>
<main><section id="stage" tabindex="0" aria-label="Interactive map. Drag to pan; scroll to zoom. Plus and minus zoom, zero resets."></section>
<aside><section><h1>Explore the world</h1><p class="hint">Drag to pan · scroll to zoom · click a city or unit</p>
<label for="empire">Highlight an empire</label><select id="empire"><option value="">All empires</option></select>
<button id="clear-focus">Clear highlight</button></section>
<section><h2>Player groups</h2><div id="player-filters"></div><p class="hint">Human includes current human slots and retained player names after AI takeover. City-states and unknown groups stay visible.</p></section>
<section><h2>Layers</h2><div id="layers"></div></section>
<section><h2>Find a city</h2><label class="visually-hidden" for="search">City name</label><input id="search" type="search" placeholder="Search cities…" autocomplete="off"><div id="search-results" aria-live="polite"></div></section>
<section id="details" aria-live="polite"><h2>Map details</h2><p>Select a city, army marker or territory.</p></section>
<section><h2 id="summary-title">Empires</h2><div id="summary"></div></section>
<details class="availability"><summary>Available views</summary><div id="availability"></div></details>
<p class="hint">Offline map · deterministic geography · current save data</p></aside></main>
<div id="status" class="visually-hidden" role="status"></div>
<noscript><p class="noscript">Enable JavaScript to explore this map.</p>{variants[mode]}</noscript>
{templates}
<script id="world-data" type="application/json">{script_json(payload)}</script><script>{js}</script>
</body></html>
'''
