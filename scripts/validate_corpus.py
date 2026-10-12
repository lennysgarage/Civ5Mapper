"""Validate local save copies without bundling or modifying them.

Usage: python3 scripts/validate_corpus.py artifacts/save-corpus -o artifacts/corpus-report.json
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from civmapper.extract import extract_bytes

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
parser.add_argument('-o', '--output', type=Path, required=True)
args = parser.parse_args()
results = []
for index, path in enumerate(sorted(args.directory.rglob('*.Civ5Save'))):
    data = path.read_bytes()
    record = {'file': str(path.relative_to(args.directory)), 'sha256': hashlib.sha256(data).hexdigest()}
    try:
        world = extract_bytes(data)
        record.update(status='passed', turn=world['game']['turn'], mode=world['inspection']['header']['mode'],
                      profile=world['inspection']['profile'], width=world['game']['width'], height=world['game']['height'],
                      tiles=len(world['tiles']), cities=len(world['cities']),
                      capitals=world['extraction']['fields'].get('capitals'),
                      knownCapitalCities=sum(c['capital'] is True for c in world['cities']),
                      unknownCapitalCities=sum(c['capital'] is None for c in world['cities']),
                      routeTiles=sum(t.get('routeId') is not None for t in world['tiles']),
                      pillagedRouteTiles=sum(t.get('routeId') is not None and t.get('routePillaged') is True for t in world['tiles']),
                      cityStateAlliances=world['extraction']['fields'].get('cityStateAlliances'),
                      knownCityStates=sum(c.get('allianceKnown') is True for c in world['civilizations']),
                      alliedCityStates=sum(c.get('allianceKnown') is True and c.get('ally') is not None for c in world['civilizations']))
    except (ValueError, KeyError) as exc:
        record.update(status='failed', error=str(exc))
    results.append(record)
    if index % 20 == 0:
        print(f'Checked {index+1} saves...', flush=True)
args.output.write_text(json.dumps(results, indent=2)+'\n')
print(f"Passed {sum(r['status']=='passed' for r in results)}/{len(results)} saves. Report: {args.output}")
sys.exit(0 if all(r['status'] == 'passed' for r in results) else 1)
