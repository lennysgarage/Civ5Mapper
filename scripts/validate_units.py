"""Validate optional v9 unit extraction on copied save fixtures."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from civmapper.extract import extract_bytes
from civmapper.ruleset import enrich


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('-o','--output',required=True,type=Path)
    parser.add_argument('--ruleset',type=Path)
    args=parser.parse_args()
    sources=sorted(args.directory.rglob('*.Civ5Save'))
    if not sources:parser.error('no copied .Civ5Save files found')
    if any(args.output.resolve()==p.resolve() for p in sources) or args.ruleset and args.output.resolve()==args.ruleset.resolve():
        parser.error('report path must differ from inputs')
    report=[]
    for index,source in enumerate(sources):
        entry={'file':str(source)}
        try:
            world=extract_bytes(source.read_bytes(),include_units=True)
            if args.ruleset:world=enrich(world,args.ruleset)
            major={c['id'] for c in world['civilizations'] if c['kind']=='major'}
            entry.update(status='passed',profile=world['inspection']['profile'],units=len(world['units']),
                         majorUnits=sum(u['owner'] in major for u in world['units']),
                         majorMilitaryUnits=sum(u['owner'] in major and u['isMilitary'] is True for u in world['units']) if args.ruleset else None)
        except (OSError,ValueError) as error:
            entry.update(status='failed',error=str(error))
        report.append(entry)
        if index%10==0:print(f'{index+1}/{len(sources)}: {source.name}: {entry["status"]}',file=sys.stderr,flush=True)
    result={'passed':sum(r['status']=='passed' for r in report),'total':len(report),'results':report}
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(f'{result["passed"]}/{result["total"]} passed')
    return 0 if result['passed']==result['total'] else 2


if __name__=='__main__':sys.exit(main())
