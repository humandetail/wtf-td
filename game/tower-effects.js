// Burn refreshes without stacking; the strongest active spell owns the damage.
export function ignite(enemy,stats){enemy.burnDps=Math.max(enemy.burnRemaining>0?enemy.burnDps:0,stats.burnDps);enemy.burnRemaining=stats.burnDuration;}
export function tickBurn(enemy,dt,hurt){if(enemy.hp<=0||!(enemy.burnRemaining>0))return;const time=Math.min(dt,enemy.burnRemaining);enemy.burnRemaining=Math.max(0,enemy.burnRemaining-time);hurt(enemy.burnDps*time);}
