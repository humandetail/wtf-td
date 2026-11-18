const families = {
  projectile: ['#f6cf8b', 'T01 T14 T18 T27 T35'],
  burst: ['#ffc080', 'T03 T17 T20 T33'],
  beam: ['#ed9fff', 'T04 T23 T25'],
  arc: ['#c4b4ff', 'T05'],
  water: ['#79e4ff', 'T06 T26'],
  frost: ['#b7f1ff', 'T08'],
  fire: ['#ffaf6f', 'T13 T15 T16 T34'],
  net: ['#c8f2aa', 'T07 T19'],
  shock: ['#f3d18d', 'T12 T32'],
  radar: ['#9becbc', 'T09 T22 T30 T36'],
  charge: ['#b6eace', 'T10 T29'],
  gold: ['#f4d67f', 'T11'],
  suppress: ['#e8adff', 'T02 T21 T24 T28'],
  dual: ['#a8ccff', 'T31'],
};

const towers = new Map();
for (const [icon, [color, codes]] of Object.entries(families)) {
  for (const code of codes.split(' ')) towers.set(code, { icon, color });
}

export const towerVisual = code => towers.get(code) ?? { icon: 'projectile', color: '#f6cf8b' };
export const effectColor = kind => families[kind]?.[0] ?? '#cfefe0';

const upgrades = {
  T01:['charge','beam'], T02:['suppress','radar'], T03:['shock','burst'], T04:['charge','arc'],
  T05:['arc','burst'], T06:['water','shock'], T07:['net','radar'], T08:['frost','water'],
  T09:['radar','burst'], T10:['shield','charge'], T11:['upgrade','gold'], T12:['slash','shock'],
  T13:['fire','burst'], T14:['upgrade','burst'], T15:['burst','fire'], T16:['radar','fire'],
  T17:['net','burst'], T18:['shield','net'], T19:['dash','net'], T20:['dual','projectile'],
  T21:['net','burst'], T22:['dual','upgrade'], T23:['slash','burst'], T24:['arc','suppress'],
  T25:['upgrade','burst'], T26:['net','water'], T27:['net','dual'], T28:['shield','radar'],
  T29:['dash','charge'], T30:['suppress','dual'], T31:['shield','dual'], T32:['dual','shock'],
  T33:['charge','burst'], T34:['burst','fire'], T35:['radar','suppress'], T36:['dual','charge'],
};
export const towerSkillIcon = (code, index) => upgrades[code]?.[index - 1] ?? towerVisual(code).icon;
export const HERO_ICONS = { Q: 'slash', E: 'dash', R: 'shield' };
