"""facet rows + edge type counts of a model JSON: python _list.py <json>"""
import json, sys
from collections import Counter
d = json.load(open(sys.argv[1]))
for f in d['facets']: print(f['id'], 'z', f.get('zone'), f['pitch'], 'az', f['azimuth_deg'], f['plan_sqft'], 'sf', f['eave_height_ft'], '-', f['top_height_ft'], 'seg', f.get('eave_seg'), 'junc', f.get('junction'), 'kept' if f.get('kept') else '')
print(Counter(e['type'] for e in d['edges']))
if 'house' in d: print({k: v for k, v in d['house']['audit'].items()})
