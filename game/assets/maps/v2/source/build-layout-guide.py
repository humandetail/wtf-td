import json,re
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).parent
j=json.loads((root/'layout.json').read_text())
im=Image.new('RGB',(1280,800),'#8caa70');d=ImageDraw.Draw(im)
d.rectangle((0,0,640,400),fill='#b9d19a');d.rectangle((640,0,1279,400),fill='#d9bf7c');d.rectangle((640,400,1279,799),fill='#a6bfa4');d.rectangle((0,400,640,799),fill='#b5aaaf')
# reserved moss ridge, surrounded by the playable route
d.polygon([(425,310),(580,300),(720,325),(870,380),(880,440),(760,450),(590,420),(435,400)],fill='#647d57')
# accurate route samples; this is a layout constraint, not finished road art
t=re.findall(r'[MLQZ]|-?\d+(?:\.\d+)?',j['ROAD_PATH']);i=0;pts=[];cur=(0,0)
while i<len(t):
 c=t[i];i+=1
 if c in 'ML':
  cur=(float(t[i]),float(t[i+1]));i+=2;pts.append(cur)
 elif c=='Q':
  ctl=(float(t[i]),float(t[i+1]));end=(float(t[i+2]),float(t[i+3]));i+=4;start=cur
  for k in range(1,21):
   a=k/20;pts.append(((1-a)**2*start[0]+2*(1-a)*a*ctl[0]+a*a*end[0],(1-a)**2*start[1]+2*(1-a)*a*ctl[1]+a*a*end[1]))
  cur=end
 elif c=='Z':pts.append(pts[0])
d.line(pts,fill='#d4d9cb',width=90,joint='curve')
# blue stream runs under future bridges; exact crossing centers retained
d.line([(1100,440),(1070,465),(1040,495),(1000,520),(970,550),(960,590),(970,620),(1000,650),(1000,760),(1010,799)],fill='#559aa3',width=42,joint='curve')
for slot in j['SLOTS']:
 x,y=slot['x'],slot['y'];col='#b9d19a' if x<640 and y<400 else '#d9bf7c' if y<400 else '#a6bfa4' if x>640 else '#b5aaaf'
 d.rectangle((x-45,y-28,x+45,y+28),fill=col)
im.save(root/'layout-guide.png')
