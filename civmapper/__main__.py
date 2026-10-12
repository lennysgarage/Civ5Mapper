import argparse
import json
import sys
from pathlib import Path

from .render import render_svg
from .save import MAX_INPUT, ParseError, inspect_bytes
from .extract import extract_bytes, PROFILES
from .ruleset import enrich
from .styles import PRESETS, load_style, style_path
import sqlite3


def main():
    parser = argparse.ArgumentParser(description='Civ V saves/replays to normalized JSON, political SVG/PNG and replay GIF')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('styles', help='list installed style presets')
    server = commands.add_parser('serve', help='start a local save upload and interactive map server')
    server.add_argument('--host', choices=['127.0.0.1','localhost'], default='127.0.0.1')
    server.add_argument('--port', type=int, default=8000)
    server.add_argument('--ruleset', type=Path)
    server.add_argument('--localization', type=Path)
    server.add_argument('--profile', choices=['auto']+list(PROFILES), default='auto')
    server.add_argument('--no-player-names', action='store_true')
    server.add_argument('--no-enrichment', action='store_true')
    inspect = commands.add_parser('inspect', help='extract partial metadata; does not extract a complete map')
    inspect.add_argument('save', type=Path)
    inspect.add_argument('-o', '--output', required=True, type=Path)
    inspect.add_argument('--dump-state', type=Path, help='optionally write decompressed binary for research')
    extract = commands.add_parser('extract', help='extract a validated current world from supported BNW saves')
    extract.add_argument('save', type=Path)
    extract.add_argument('-o', '--output', required=True, type=Path)
    extract.add_argument('--no-player-names', action='store_true', help='omit saved multiplayer display nicknames from JSON')
    extract.add_argument('--profile', choices=['auto'] + list(PROFILES), default='auto')
    extract.add_argument('--units',action='store_true',help='also extract validated current unit positions/types; matching ruleset resolves military classification')
    extract.add_argument('--ruleset', type=Path, help='matching Civ5DebugDatabase.db; validates roster IDs and terrain classifications')
    extract.add_argument('--localization', type=Path, help='Localization-Merged.db for English labels')
    render = commands.add_parser('render', help='render complete normalized JSON')
    render.add_argument('world', type=Path)
    render.add_argument('-o', '--output', required=True, type=Path)
    render.add_argument('--style', help='atlas, parchment, minimalist, or a custom JSON path')
    render.add_argument('--mode',choices=['political','physical','army'],default='political')
    render.add_argument('--scale', type=float, default=1, help='PNG export scale (0.25–8)')
    render_save=commands.add_parser('render-save',help='extract and render a supported save in one command')
    render_save.add_argument('save',type=Path)
    render_save.add_argument('-o','--output',type=Path,help='PNG, SVG or offline HTML; defaults to artifacts/<save-name>[-physical|-army].png')
    render_save.add_argument('--style',help='atlas, parchment, minimalist, or a custom JSON path')
    render_save.add_argument('--mode',choices=['political','physical','army'],default='political')
    render_save.add_argument('--scale',type=float,default=2,help='PNG export scale (0.25–8; default 2)')
    render_save.add_argument('--profile',choices=['auto']+list(PROFILES),default='auto')
    render_save.add_argument('--no-player-names',action='store_true')
    render_save.add_argument('--ruleset',type=Path,help='matching ruleset; defaults to local artifacts/ruleset cache if present')
    render_save.add_argument('--localization',type=Path,help='matching localization; defaults to local artifacts/ruleset cache if present')
    render_save.add_argument('--no-enrichment',action='store_true',help='disable automatic local database lookup')
    for command in (extract,render,render_save):
        command.add_argument('--turn-one-save',type=Path,help='optional matching turn-1 Civ5Save recording historical slot status in JSON')
    for renderer in (render,render_save):
        renderer.add_argument('--army-icons',choices=['domain','detailed'],help='army symbols: domain (default) or detailed ruleset roles')
        renderer.add_argument('--military-summary',action='store_true',help='append per-empire military counts; requires --mode army')
    replay_extract=commands.add_parser('extract-replay',help='export validated save/replay event log as reusable JSON')
    replay_extract.add_argument('replay',type=Path)
    replay_extract.add_argument('-o','--output',required=True,type=Path)
    replay_render=commands.add_parser('render-replay',help='animate replay ownership/city events as GIF; SVG exports the last selected frame')
    replay_render.add_argument('--map',type=Path,help='matching Civ5Map or normalized/upstream map JSON')
    replay_render.add_argument('--replay',required=True,type=Path,help='Civ5Save, Civ5Replay or exported replay JSON')
    replay_render.add_argument('-o','--output',required=True,type=Path)
    replay_render.add_argument('--maxturns','-maxturns',type=int,default=0,help='number of eventful turns; 0 means all')
    replay_render.add_argument('--style',help='atlas, parchment, minimalist, or a custom JSON path')
    replay_render.add_argument('--captions',action='store_true',help='show major city events in a panel below each replay frame')
    replay_render.add_argument('--mode',choices=['political','physical','army'],default='political',help='physical needs resolved base terrain; historical armies are unavailable')
    replay_render.add_argument('--owner-map',type=Path,help='JSON object mapping scenario owner IDs to replay IDs when metadata cannot join them')
    replay_render.add_argument('--scale',type=float,default=0.5)
    replay_render.add_argument('--duration',type=int,default=1000,help='milliseconds per eventful turn')
    wrap=replay_render.add_mutually_exclusive_group()
    wrap.add_argument('--wrap-x',dest='wrap_x',action='store_true')
    wrap.add_argument('--no-wrap-x',dest='wrap_x',action='store_false')
    replay_render.set_defaults(wrap_x=None)
    args = parser.parse_args()
    try:
        if args.command=='serve':
            from .server import ServerConfig, serve
            if args.no_enrichment and (args.ruleset or args.localization):
                raise ValueError('--no-enrichment cannot be combined with database options')
            if not args.no_enrichment:
                for key,filename in (('ruleset','Civ5DebugDatabase.db'),('localization','Localization-Merged.db')):
                    local=Path('artifacts/ruleset')/filename
                    if getattr(args,key) is None and local.is_file():setattr(args,key,local)
            for path in (args.ruleset,args.localization):
                if path is not None and not path.is_file():raise ValueError(f'database not found: {path}')
            serve(ServerConfig(args.ruleset,args.localization,args.profile,not args.no_player_names), args.host,args.port)
            return
        if args.command=='styles':
            for name in sorted(PRESETS):print(f'{name:12} {PRESETS[name]}')
            return
        custom_style=style_path(getattr(args,'style',None))
        default_save_output=args.command=='render-save' and args.output is None
        if args.command=='render-save':
            if args.save.suffix.lower()!='.civ5save':raise ValueError('render-save input must end in .Civ5Save')
            if args.no_enrichment and (args.ruleset or args.localization):
                raise ValueError('--no-enrichment cannot be combined with database options')
            mode_suffix='' if args.mode=='political' else '-'+args.mode
            args.output=args.output or Path('artifacts')/(args.save.stem+mode_suffix+'.png')
            if not args.no_enrichment:
                for key,filename in (('ruleset','Civ5DebugDatabase.db'),('localization','Localization-Merged.db')):
                    local=Path('artifacts/ruleset')/filename
                    if getattr(args,key) is None and local.is_file():
                        setattr(args,key,local)
                        print(f'Using local {key}: {local}',file=sys.stderr)
        if args.command in ('extract-replay','render-replay'):
            inputs=[args.replay]
            if args.command=='render-replay':inputs += [p for p in (args.map,custom_style,args.owner_map) if p]
        else:
            inputs = [args.save] if args.command in ('inspect', 'extract','render-save') else [args.world] + ([custom_style] if custom_style else [])
            if args.command=='render-save' and custom_style:inputs.append(custom_style)
        if args.command in ('extract','render-save'):
            inputs += [p for p in (args.ruleset, args.localization) if p]
        if getattr(args,'turn_one_save',None):inputs.append(args.turn_one_save)
        outputs = [args.output] + ([args.dump_state] if args.command == 'inspect' and args.dump_state else [])
        resolved = [p.resolve() for p in outputs]
        if len(set(resolved)) != len(resolved) or any(p.resolve() in resolved for p in inputs):
            raise ValueError('output paths must differ from inputs and each other')
        style=load_style(getattr(args,'style',None))
        if args.command in ('render','render-save'):
            if (args.army_icons or args.military_summary) and args.mode!='army':
                raise ValueError('--army-icons and --military-summary require --mode army')
            if args.army_icons or args.military_summary:
                style=dict(style or {})
                if args.army_icons:style['armyIcons']=args.army_icons
                if args.military_summary:style['showMilitarySummary']=True
        if args.command in ('extract-replay','render-replay'):
            from .replay import parse_replay,parse_save_replay
            from .replay_render import render_replay,validate_replay
            suffix=args.replay.suffix.lower()
            with args.replay.open('rb') as handle:data=handle.read(MAX_INPUT+1)
            if len(data)>MAX_INPUT:raise ValueError('replay input size limit exceeded')
            if suffix=='.civ5save':result=parse_save_replay(data)
            elif suffix=='.civ5replay':result=parse_replay(data)
            elif suffix=='.json':result=json.loads(data);validate_replay(result)
            else:raise ValueError('replay input must be .Civ5Save, .Civ5Replay or exported .json')
            if args.command=='extract-replay':
                args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
                print(f"Exported {len(result['events'])} replay events to {args.output}",file=sys.stderr)
            else:
                from .mapio import load_map
                base=load_map(args.map) if args.map else None
                owner_map=json.loads(args.owner_map.read_text(encoding='utf-8')) if args.owner_map else None
                report=render_replay(result,args.output,base,style,args.maxturns,str(args.map) if args.map else None,
                                     args.wrap_x,args.duration,args.scale,owner_map,captions=args.captions,mode=args.mode)
                for warning in report['warnings']:print(f'warning: {warning}',file=sys.stderr)
                print(f"Rendered {len(report['frames'])} eventful turns to {args.output}",file=sys.stderr)
        elif args.command in ('inspect', 'extract'):
            with args.save.open('rb') as handle:
                data = handle.read(MAX_INPUT + 1)
            if args.command == 'inspect':
                result, state = inspect_bytes(data,diagnostics=True)
            else:
                unit_options={'include_units':True} if args.units else {}
                result = extract_bytes(data, args.profile, include_player_names=not args.no_player_names,**unit_options)
                if args.ruleset or args.localization:
                    result = enrich(result, args.ruleset, args.localization)
                if args.turn_one_save:
                    from .player_history import load_turn_one_players
                    result=load_turn_one_players(result,args.turn_one_save)
            args.output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
            if args.command == 'inspect' and args.dump_state:
                args.dump_state.write_bytes(state)
            print(f"{result['extraction']['status'].capitalize()} extraction written to {args.output}.", file=sys.stderr)
        else:
            if args.command=='render-save':
                with args.save.open('rb') as handle:data=handle.read(MAX_INPUT+1)
                unit_options={'include_units':True} if args.mode=='army' else {}
                world=extract_bytes(data,args.profile,include_player_names=not args.no_player_names,**unit_options)
                if args.ruleset or args.localization:world=enrich(world,args.ruleset,args.localization)
            else:
                world = json.loads(args.world.read_text(encoding='utf-8'))
            if args.turn_one_save:
                from .player_history import load_turn_one_players
                world=load_turn_one_players(world,args.turn_one_save)
            if args.output.suffix.lower() in ('.html','.htm'):
                from .html_export import render_html
                document=render_html(world,style,mode=args.mode)
                if default_save_output:args.output.parent.mkdir(parents=True,exist_ok=True)
                args.output.write_text(document,encoding='utf-8')
                print(f'Interactive map written to {args.output}',file=sys.stderr)
                return
            svg = render_svg(world, style,mode=args.mode)
            if args.output.suffix.lower() == '.png':
                if not 0.25 <= args.scale <= 8:
                    raise ValueError('PNG scale must be between 0.25 and 8')
                try:
                    import cairosvg
                except ImportError:
                    raise ValueError('PNG export requires the optional dependency: pip install ".[png]"') from None
                if default_save_output:args.output.parent.mkdir(parents=True,exist_ok=True)
                cairosvg.svg2png(bytestring=svg.encode(), write_to=str(args.output), scale=args.scale)
            elif args.output.suffix.lower() == '.svg':
                if default_save_output:args.output.parent.mkdir(parents=True,exist_ok=True)
                args.output.write_text(svg, encoding='utf-8')
            else:
                raise ValueError('render output must end in .svg, .png or .html/.htm')
            print(f'Map written to {args.output}', file=sys.stderr)
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as exc:
        parser.exit(2, f'error: {exc}\n')


if __name__ == '__main__':
    main()
