export const WORLD = { width: 1280, height: 800 };
export const ROAD_WIDTH = 72;
export const ENTRY = { x: 640, y: 125 };

// One clockwise loop folds into each district, creating different fire lanes.
const vertices = [
  ENTRY, { x: 1145, y: 125 }, { x: 1145, y: 350 },
  { x: 965, y: 350 }, { x: 965, y: 495 }, { x: 1130, y: 495 },
  { x: 1130, y: 650 }, { x: 775, y: 650 }, { x: 775, y: 505 },
  { x: 535, y: 505 }, { x: 535, y: 670 }, { x: 185, y: 670 },
  { x: 185, y: 470 }, { x: 355, y: 470 }, { x: 355, y: 290 },
  { x: 160, y: 290 }, { x: 160, y: 125 },
];
const corners = vertices.map((point, index) => {
  const previous = vertices[(index + vertices.length - 1) % vertices.length];
  const next = vertices[(index + 1) % vertices.length];
  const incoming = Math.hypot(point.x - previous.x, point.y - previous.y);
  const outgoing = Math.hypot(next.x - point.x, next.y - point.y);
  const cut = index === 0 ? 0 : Math.min(38, incoming / 3, outgoing / 3);
  return {
    point, cut,
    before: { x: point.x + (previous.x - point.x) * cut / incoming, y: point.y + (previous.y - point.y) * cut / incoming },
    after: { x: point.x + (next.x - point.x) * cut / outgoing, y: point.y + (next.y - point.y) * cut / outgoing },
  };
});

// Road artwork and movement are derived from the same rounded outline.
let roadPath = `M${ENTRY.x} ${ENTRY.y}`;
const points = [{ ...ENTRY }];
for (let index = 1; index <= corners.length; index++) {
  const { point, before, after, cut } = corners[index % corners.length];
  roadPath += `L${before.x} ${before.y}`;
  points.push(before);
  if (!cut) continue;
  roadPath += `Q${point.x} ${point.y} ${after.x} ${after.y}`;
  for (let step = 1; step <= 10; step++) {
    const t = step / 10;
    points.push({
      x: (1 - t) ** 2 * before.x + 2 * (1 - t) * t * point.x + t ** 2 * after.x,
      y: (1 - t) ** 2 * before.y + 2 * (1 - t) * t * point.y + t ** 2 * after.y,
    });
  }
}
export const ROAD_PATH = roadPath + 'Z';
export const LOOP = points;

export const ZONES = [
  { name: '竹林山门', role: '入口布防', x: 285, y: 55, color: '#b9d19a' },
  { name: '科技营地', role: '长线压制', x: 1030, y: 55, color: '#e8ca7e' },
  { name: '溪谷石桥', role: '回折交火', x: 1030, y: 744, color: '#a5dce0' },
  { name: '符阵遗迹', role: '积怪补漏', x: 210, y: 748, color: '#d4bbe4' },
];

export const SLOTS = [
  { id: 1, x: 405, y: 215 }, { id: 2, x: 585, y: 232 },
  { id: 3, x: 755, y: 232 }, { id: 4, x: 1035, y: 235 },
  { id: 5, x: 265, y: 565 }, { id: 6, x: 440, y: 600 },
  { id: 7, x: 875, y: 570 }, { id: 8, x: 1050, y: 580 },
  { id: 9, x: 275, y: 205 }, { id: 10, x: 440, y: 76 },
  { id: 11, x: 875, y: 76 }, { id: 12, x: 1190, y: 565 },
  { id: 13, x: 355, y: 745 }, { id: 14, x: 85, y: 610 },
  { id: 15, x: 1145, y: 735 }, { id: 16, x: 660, y: 620 },
  { id: 17, x: 80, y: 205 }, { id: 18, x: 262, y: 375 },
  { id: 19, x: 1215, y: 285 }, { id: 20, x: 1060, y: 425 },
];

export const SEGMENTS = LOOP.slice(1).map((end, i) => {
  const start = LOOP[i];
  return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) };
}).filter(segment => segment.length > 0);
export const LOOP_LENGTH = SEGMENTS.reduce((sum, segment) => sum + segment.length, 0);
export function pointOnLoop(distance) {
  let remaining = ((distance % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
  for (const segment of SEGMENTS) {
    if (remaining <= segment.length) {
      const ratio = remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
        angle: Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x),
      };
    }
    remaining -= segment.length;
  }
  return { ...ENTRY, angle: 0 };
}
