# side-by-side: previous round (left) vs this round (right), one strip per shot
import sys, os
from PIL import Image, ImageDraw, ImageFont
prev, cur = sys.argv[1], sys.argv[2]
names=["2-nimbus-copilot.png","2-click.png","2-phone.png","2-phone-sheet.png","2-phone-430.png"]
try: font=ImageFont.truetype("arial.ttf",26)
except Exception: font=ImageFont.load_default()
rows=[]
for n in names:
    a=os.path.join(prev,n); b=os.path.join(cur,n)
    if not os.path.exists(b): continue
    B=Image.open(b).convert("RGB"); A=Image.open(a).convert("RGB") if os.path.exists(a) else Image.new("RGB",B.size,(230,232,237))
    h=560; A=A.resize((round(A.width*h/A.height),h)); B=B.resize((round(B.width*h/B.height),h))
    row=Image.new("RGB",(A.width+B.width+60,h+50),(247,248,250)); d=ImageDraw.Draw(row)
    d.text((20,12),f"{os.path.basename(prev)}  {n}",fill=(70,80,101),font=font); d.text((A.width+40,12),f"{os.path.basename(cur)}  {n}",fill=(39,87,230),font=font)
    row.paste(A,(20,46)); row.paste(B,(A.width+40,46)); rows.append(row)
W=max(r.width for r in rows); H=sum(r.height for r in rows)
out=Image.new("RGB",(W,H),(247,248,250)); y=0
for r in rows: out.paste(r,(0,y)); y+=r.height
out.save(os.path.join(cur,"vs-prev.png")); print("wrote",os.path.join(cur,"vs-prev.png"),out.size)
