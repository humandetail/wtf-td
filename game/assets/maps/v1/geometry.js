export const WORLD = { width: 1280, height: 800 };
export const ROAD_WIDTH = 82;

// Clockwise rounded loop. The map artist and simulation share these coordinates.
const points = [{ x: 640, y: 170 }, { x: 1000, y: 170 }];
function corner(cx, cy, from) {
  for (let i = 1; i <= 12; i++) {
    const angle = (from + i * 90 / 12) * Math.PI / 180;
    points.push({ x: cx + Math.cos(angle) * 110, y: cy + Math.sin(angle) * 110 });
  }
}
corner(1000, 280, -90);
points.push({ x: 1110, y: 520 });
corner(1000, 520, 0);
points.push({ x: 280, y: 630 });
corner(280, 520, 90);
points.push({ x: 170, y: 280 });
corner(280, 280, 180);
points.push({ x: 640, y: 170 });
export const LOOP = points;
export const SLOTS = [
  ...[350, 540, 730, 920].map((x, i) => ({ id: i + 1, x, y: 292 })),
  ...[350, 540, 730, 920].map((x, i) => ({ id: i + 5, x, y: 508 })),
  ...[350, 540, 730, 920].map((x, i) => ({ id: i + 9, x, y: 76 })),
  ...[350, 540, 730, 920].map((x, i) => ({ id: i + 13, x, y: 724 })),
  { id: 17, x: 69, y: 350 }, { id: 18, x: 69, y: 463 },
  { id: 19, x: 1211, y: 350 }, { id: 20, x: 1211, y: 463 },
];

export const SEGMENTS = LOOP.slice(1).map((end, i) => {
  const start = LOOP[i];
  return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) };
});
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
  return { x: 640, y: 170, angle: 0 };
}
