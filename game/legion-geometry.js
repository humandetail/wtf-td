export const LEGION_FIELD={left:180,right:1100,top:125,bottom:720};
export const LEGION_DEPLOYMENT={left:210,right:1070,top:330,bottom:620};
export const LEGION_KING={x:640,y:690,radius:30};
export const LEGION_RADIUS=15;
export function legionPlacement(x,y,fighters=[]){
 const b=LEGION_DEPLOYMENT;
 return Number.isFinite(x)&&Number.isFinite(y)&&x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom&&fighters.every(f=>Math.hypot(f.x-x,f.y-y)>=LEGION_RADIUS*2+8);
}
// Sweep each displacement against live circles before committing it. A valid
// starting layout therefore remains valid, including at edges and in crowds;
// no iterative overlap pushing can squeeze a unit through a neighbor or wall.
export function moveLegionUnit(unit,dx,dy,units){
 const radius=unit.radius||LEGION_RADIUS,epsilon=1e-7;
 let amount=1;
 for(const other of units){
  if(other===unit||other.hp<=0)continue;
  const ox=unit.x-other.x,oy=unit.y-other.y,minimum=radius+(other.radius||LEGION_RADIUS);
  const a=dx*dx+dy*dy,b=2*(ox*dx+oy*dy),c=ox*ox+oy*oy-minimum*minimum;
  if(a===0||b>=0)continue;
  if(c<=1e-5){amount=0;continue;}
  const discriminant=b*b-4*a*c;if(discriminant<0)continue;
  const contact=(-b-Math.sqrt(discriminant))/(2*a);
  if(contact>=-epsilon&&contact<amount)amount=Math.max(0,contact-epsilon);
 }
 const left=LEGION_FIELD.left+radius,right=LEGION_FIELD.right-radius,top=LEGION_FIELD.top+radius,bottom=690;
 if(dx<0)amount=Math.min(amount,(left-unit.x)/dx);else if(dx>0)amount=Math.min(amount,(right-unit.x)/dx);
 if(dy<0)amount=Math.min(amount,(top-unit.y)/dy);else if(dy>0)amount=Math.min(amount,(bottom-unit.y)/dy);
 amount=Math.max(0,Math.min(1,amount));unit.x+=dx*amount;unit.y+=dy*amount;
 return amount;
}
