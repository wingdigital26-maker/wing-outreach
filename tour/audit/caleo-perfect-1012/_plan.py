"""plan PNG of the model facets (zone colours, labels, heights at corners): python _plan.py <json> <out.png>"""
import json, sys, math
from PIL import Image, ImageDraw, ImageFont
d=json.load(open(sys.argv[1])); g=d['geometry_ft']; S=9; W=1000; H=1000
img=Image.new('RGB',(W,H),'white'); dr=ImageDraw.Draw(img)
try: font=ImageFont.truetype("arial.ttf",12); small=ImageFont.truetype("arial.ttf",9)
except Exception: font=small=None
X=lambda x: W/2+x*S; Y=lambda y: H/2-y*S
cols=['#f4b183','#9dc3e6','#a9d18e','#ffd966','#c9a0dc','#f8cbad']
byid={f['id']:f for f in d['facets']}
for z in g.get('zones',[]):
    pts=[(X(p[0]),Y(p[1])) for p in z['ring']]; dr.polygon(pts,outline='black')
for fid,rings in g['facets'].items():
    f=byid[fid]; r=rings[0]; pts=[(X(p[0]),Y(p[1])) for p in r]
    dr.polygon(pts,fill=cols[f.get('zone',0)%6],outline='#333')
    cx=sum(p[0] for p in r)/len(r); cy=sum(p[1] for p in r)/len(r)
    a=math.radians(f['azimuth_deg']); dr.line([(X(cx),Y(cy)),(X(cx+3*math.sin(a)),Y(cy+3*math.cos(a)))],fill='black',width=2)
    dr.text((X(cx)-12,Y(cy)-16),f"{fid} {f['pitch']} {f['eave_height_ft']}-{f['top_height_ft']}",fill='black',font=font)
EC={'ridge':'#C0262D','hip':'#E07B00','valley':'#2757E6','eave':'#1F8A4C','rake':'#7A3FB8','wall_flashing':'#5A6478','step_flashing':'#0E9AA7'}
for e in d['edges']:
    dr.line([(X(e['a_ft'][0]),Y(e['a_ft'][1])),(X(e['b_ft'][0]),Y(e['b_ft'][1]))],fill=EC.get(e['type'],'gray'),width=3 if e['type']!='eave' else 2)
dr.text((10,10),f"{len(g['facets'])} facets; red ridge, orange hip, blue valley, green eave, purple rake, grey wall",fill='black',font=font)
img.save(sys.argv[2]); print('saved',sys.argv[2])
