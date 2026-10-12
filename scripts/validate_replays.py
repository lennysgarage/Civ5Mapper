"""Inspect copied replay corpus; never changes source files."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from civmapper.replay import parse_replay
from civmapper.replay_render import replay_frames
p=argparse.ArgumentParser();p.add_argument('directory',type=Path);p.add_argument('-o','--output',type=Path,required=True)
a=p.parse_args();results=[]
for path in sorted(a.directory.glob('*.Civ5Replay')):
    data=path.read_bytes();record={'file':path.name,'sha256':hashlib.sha256(data).hexdigest()}
    try:
        replay=parse_replay(data)
        record.update(status='passed',profile=replay['inspection']['eventProfile'],events=len(replay['events']),
                      datasets=len(replay['datasets']),width=replay['game']['width'],height=replay['game']['height'])
    except ValueError as exc:record.update(status='unsupported',error=str(exc))
    results.append(record)
a.output.write_text(json.dumps(results,indent=2)+'\n')
print(f"Parsed {sum(r['status']=='passed' for r in results)}/{len(results)} replays; unsupported files remain explicit. Report: {a.output}")
