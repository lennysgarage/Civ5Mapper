"""Evidence-only layout diagnostics; candidates never become extracted facts."""
import struct
from .save import ParseError


def layout_diagnostics(state, header):
    report={'plotVersion':None,'plotVersionOffset':None,'cityVersionCandidates':[],
            'yieldCountCandidates':[],'profileAttempts':[],
            'warning':'Unvalidated byte-pattern candidates are research hints, not decoded game fields.'}
    if header is None:return report
    offset=header['endOffset']
    if offset+4<=len(state):
        report.update(plotVersion=struct.unpack_from('<I',state,offset)[0],plotVersionOffset=offset)
    from .extract import PROFILES,read_plots
    start=offset
    city_refs=[]
    for name,profile in PROFILES.items():
        try:
            tiles,evidence=read_plots(state,header,profile)
            city_refs=[t for t in tiles if t.get('cityReference')]
            report['profileAttempts'].append({'profile':name,'status':'validated-plots','endOffset':evidence['endOffset']})
            report['yieldCountCandidates'].append({'count':profile['yields'],'profile':name,'evidence':'full plot-grid validation'})
            start=evidence['endOffset']
        except ParseError as exc:
            report['profileAttempts'].append({'profile':name,'status':'rejected','error':str(exc)})
    # A city-prefix candidate requires version + plausible allocator ID +
    # in-grid int32 coordinates. It is NOT a city record or owner declaration.
    limit=min(len(state)-16,start+16*1024*1024)
    versions=set()
    if city_refs:
        for tile in city_refs[:32]:
            marker=struct.pack('<iii',tile['cityReference']['localId'],tile['x'],tile['y'])
            pos=start+4
            while (pos:=state.find(marker,pos,limit))>=0:
                version=struct.unpack_from('<I',state,pos-4)[0]
                if 1<=version<=65535:
                    report['cityVersionCandidates'].append({'version':version,'offset':pos-4,
                        'evidence':'plot city-reference ID/coordinate match; version unvalidated'})
                    versions.add(version)
                pos+=1
                if len(report['cityVersionCandidates'])>=32:break
            if len(report['cityVersionCandidates'])>=32:break
        report['cityVersionCandidates'].sort(key=lambda c:c['offset'])
        report['cityVersionsObserved']=sorted(versions)
        return report
    for version in range(1,17):
        marker=struct.pack('<I',version);pos=start
        while (pos:=state.find(marker,pos,limit))>=0:
            if len(report['cityVersionCandidates'])>=32:break
            local_id,x,y=struct.unpack_from('<iii',state,pos+4)
            if 8192<=local_id<=0x1fffffff and 0<=x<header['width'] and 0<=y<header['height']:
                report['cityVersionCandidates'].append({'version':version,'offset':pos,'evidence':'unvalidated version/id/coordinate prefix'})
                versions.add(version)
            pos+=1
        if len(report['cityVersionCandidates'])>=32:break
    report['cityVersionCandidates'].sort(key=lambda c:c['offset'])
    report['cityVersionsObserved']=sorted(versions)
    return report
