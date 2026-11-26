# Aggregate the measured motion numbers of every reference timing sheet (refs/rNN/timeline.json)
# into taste-stats.json: ease families with median cubic-bezier, durations (frames at 60 and 30),
# overshoot, shot lengths, transitions, type sizes, motion blur use. Run: python -I taste_stats.py <refs dir> <out.json>
import json, sys, statistics as st, collections, re
refs, out = sys.argv[1], sys.argv[2]
R = ['r01','r02','r03','r04','r05','r06','r07']
fam = collections.defaultdict(list)
durs = collections.defaultdict(list)
props = collections.defaultdict(list)
shots = []; trans = collections.Counter(); trans_ex = collections.defaultdict(list)
fonts = []; mb = collections.Counter(); over = []
starts = collections.defaultdict(list)
for r in R:
    d = json.load(open(f'{refs}/{r}/timeline.json'))
    fps = d['fps']; H = min(d['width'], d['height'])
    for s in d['shots']:
        shots.append({'ref': r, 'id': s['id'], 'frames': s['out'] - s['in'] + 1, 'sec': round((s['out'] - s['in'] + 1) / fps, 2)})
        t = s.get('transition_out') or {}
        ty = (t.get('type') or 'none')
        trans[ty] += 1
        if t.get('in') and t.get('out'):
            trans_ex[ty].append({'ref': r, 'shot': s['id'], 'frames': t['out'] - t['in'], 'sec': round((t['out'] - t['in']) / fps, 3), 'notes': (t.get('notes') or '')[:120]})
        for e in s.get('elements', []):
            mb[bool(e.get('motion_blur'))] += 1
            if e.get('font_size_px'):
                fs = e['font_size_px']
                if isinstance(fs, (int, float)):
                    fonts.append({'ref': r, 'el': e['id'], 'px': fs, 'pct_short_side': round(100 * fs / H, 2), 'font': e.get('font'), 'content': str(e.get('content'))[:60]})
            # element entrance starts per shot, for stagger
            ins = [a['kf'][0][0] for a in e.get('anims', []) if a.get('kf')]
            if ins: starts[(r, s['id'])].append((min(ins), e['id']))
            for a in e.get('anims', []):
                ez = a.get('ease') or {}
                kf = a.get('kf') or []
                if len(kf) < 2: continue
                n = kf[-1][0] - kf[0][0]
                if n <= 0: continue
                name = ez.get('named') or 'unknown'
                cb = ez.get('cubic_bezier')
                rec = {'ref': r, 'el': e['id'], 'prop': a['prop'][:70], 'frames': n, 'fps': fps, 'f30': round(n * 30 / fps, 1), 'sec': round(n / fps, 3),
                       'bezier': cb, 'measured': ez.get('measured'), 'overshoot': ez.get('overshoot', 0)}
                fam[name].append(rec)
                if ez.get('overshoot'): over.append(rec)
                p = a['prop'].lower()
                k = 'scale' if 'scale' in p else 'rotation' if 'rot' in p else 'opacity' if 'opac' in p else 'position' if ('pos' in p or 'x' == p[:1] or 'y' == p[:1]) else 'size' if ('width' in p or 'height' in p or 'size' in p or 'radius' in p) else 'other'
                props[k].append(n / fps)

def med(xs): return round(st.median(xs), 3) if xs else None
def q(xs, p):
    xs = sorted(xs); return round(xs[min(len(xs)-1, int(p*len(xs)))], 3) if xs else None
families = {}
for name, recs in sorted(fam.items(), key=lambda kv: -len(kv[1])):
    meas = [x for x in recs if x['measured'] and x['bezier']]
    bz = [x['bezier'] for x in meas]
    families[name] = {
        'count': len(recs), 'measured': len(meas),
        'median_bezier': [round(st.median([b[i] for b in bz]), 3) for i in range(4)] if bz else None,
        'sec_median': med([x['sec'] for x in recs]), 'sec_p25': q([x['sec'] for x in recs], .25), 'sec_p75': q([x['sec'] for x in recs], .75),
        'f30_median': med([x['f30'] for x in recs]), 'f60_median': med([x['sec']*60 for x in recs]),
        'examples': [{k: x[k] for k in ('ref','el','prop','frames','fps','bezier')} for x in meas[:4]],
    }
# stagger: gaps between consecutive element starts in one shot (only gaps 1..30 frames at 60 = real staggers)
gaps = []
for (r, s), lst in starts.items():
    lst.sort()
    fps = 30 if r == 'r03' else 60
    for (a, _), (b, _) in zip(lst, lst[1:]):
        g = (b - a) / fps
        if 0 < g <= 0.5: gaps.append(g)
res = {
    'source': 'refs/rNN/timeline.json (7 references, 87 shots, 357 elements, 550 keyed anims)',
    'families': families,
    'duration_by_prop_sec': {k: {'n': len(v), 'median': med(v), 'p25': q(v,.25), 'p75': q(v,.75)} for k, v in props.items()},
    'overshoot': {'n': len(over), 'median': med([x['overshoot'] for x in over]), 'p75': q([x['overshoot'] for x in over], .75), 'examples': over[:8]},
    'stagger_sec': {'n': len(gaps), 'median': med(gaps), 'p25': q(gaps,.25), 'p75': q(gaps,.75)},
    'shot_sec': {'n': len(shots), 'median': med([s['sec'] for s in shots]), 'p25': q([s['sec'] for s in shots],.25), 'p75': q([s['sec'] for s in shots],.75)},
    'transitions': trans.most_common(),
    'transition_examples': {k: v[:3] for k, v in trans_ex.items()},
    'type': {'n': len(fonts), 'pct_short_side_median': med([f['pct_short_side'] for f in fonts]), 'pct_p25': q([f['pct_short_side'] for f in fonts],.25), 'pct_p75': q([f['pct_short_side'] for f in fonts],.75), 'pct_max': max([f['pct_short_side'] for f in fonts]) if fonts else None, 'samples': fonts[:40]},
    'motion_blur_elements': dict(mb),
}
json.dump(res, open(out, 'w'), indent=1)
print(json.dumps({k: res[k] for k in ('duration_by_prop_sec','overshoot','stagger_sec','shot_sec','transitions','motion_blur_elements')}, indent=1)[:6000])
print({k: (v['count'], v['median_bezier'], v['sec_median'], v['f30_median']) for k, v in families.items()})
print({k: res['type'][k] for k in ('n','pct_short_side_median','pct_p25','pct_p75','pct_max')})
