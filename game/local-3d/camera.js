import { WORLD, LOOP_FOOTPRINT } from '../geometry.js';

const radians = Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const fieldOfView = 45 * radians;
const defaultYaw = -Math.PI / 2;
const defaultPitch = 56;
const maxZoom = 2.2;

export function createBattleCamera({mat4, quat, vec3}) {
  const view = mat4.create(), projection = mat4.create(), combined = mat4.create();
  const inverse = mat4.create(), inverseView = mat4.create(), rotation = quat.create();
  const eye = vec3.create();
  let width = WORLD.width, height = WORLD.height;
  let x, y, yaw, side, tilt, pitch, zoom;

  function engagementDistance() {
    return 880 * clamp(1.6 / (width / height), .62, 1.15);
  }

  function overviewZoom() {
    const tangent = Math.tan(fieldOfView / 2) * .88;
    const angle = 70 * radians;
    const distance = Math.max(WORLD.width / (2 * tangent * (width / height)),
      WORLD.height * Math.sin(angle) / (2 * tangent)) + WORLD.height * Math.cos(angle) / 2;
    return Math.min(.94, engagementDistance() / distance);
  }

  function zoomPitch() {
    if (zoom >= 1) return defaultPitch - 26 * Math.log(zoom) / Math.log(maxZoom);
    return defaultPitch + 14 * Math.log(zoom) / Math.log(overviewZoom());
  }

  function update() {
    const distance = engagementDistance() / zoom;
    pitch = clamp(zoomPitch() + tilt, 30, 70) * radians;
    const heading = yaw + side;
    const horizontal = Math.cos(pitch) * distance;
    vec3.set(eye, x + Math.cos(heading) * horizontal, -y + Math.sin(heading) * horizontal, Math.sin(pitch) * distance);
    mat4.lookAt(view, eye, [x, -y, 0], [0, 0, 1]);
    mat4.perspective(projection, fieldOfView, width / height, 12, 10000);
    mat4.multiply(combined, projection, view);
    mat4.invert(inverse, combined);
    mat4.invert(inverseView, view);
    mat4.getRotation(rotation, inverseView);
  }

  function reset(fit = false) {
    x = WORLD.width / 2; y = WORLD.height / 2;
    yaw = defaultYaw; side = 0; tilt = 0;
    zoom = fit ? overviewZoom() : 1;
    update();
  }

  function ray(sx, sy) {
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
    const ndcX = sx / width * 2 - 1, ndcY = 1 - sy / height * 2;
    const origin = vec3.transformMat4([], [ndcX, ndcY, -1], inverse);
    const direction = vec3.transformMat4([], [ndcX, ndcY, 1], inverse);
    vec3.subtract(direction, direction, origin);
    return {origin, direction: vec3.normalize(direction, direction)};
  }

  function ground(sx, sy, bounded = true) {
    const pointer = ray(sx, sy);
    if (!pointer || pointer.direction[2] >= -1e-6) return null;
    const {origin, direction} = pointer;
    const distance = -origin[2] / direction[2];
    const px = origin[0] + direction[0] * distance;
    const py = -origin[1] - direction[1] * distance;
    if (bounded && (px < 0 || px > WORLD.width || py < 0 || py > WORLD.height)) return null;
    return {x:px, y:py};
  }

  function project(px, py, z = 0) {
    const [sx, sy, depth] = vec3.transformMat4([], [px, -py, z], combined);
    return {x: (sx + 1) * width / 2, y: (1 - sy) * height / 2, visible: depth >= -1 && depth <= 1};
  }

  function center(px, py) {
    x = clamp(px, 0, WORLD.width);
    y = clamp(py, 0, WORLD.height);
    update();
  }

  reset();
  return {
    eye, view, projection, combined, rotation, ray, ground, project, reset,
    get pitch() { return Math.round(pitch / radians); },
    resize(w, h) {
      if (w > 0 && h > 0 && (w !== width || h !== height)) {
        width = w; height = h;
        zoom = clamp(zoom,overviewZoom(),maxZoom);
        update();
      }
    },
    pan(fromX, fromY, toX, toY) {
      const a = ground(fromX, fromY, false), b = ground(toX, toY, false);
      if (a && b) center(x + a.x - b.x, y + a.y - b.y);
    },
    orbit(turn, degrees) {
      yaw = (yaw + turn * radians) % (Math.PI * 2);
      if (degrees) tilt = clamp(pitch / radians + degrees,30,70) - zoomPitch();
      update();
    },
    lookAside(degrees) { side = degrees * radians; update(); },
    zoomBy(factor, sx = width / 2, sy = height / 2) {
      const before = ground(sx, sy, false);
      zoom = clamp(zoom * factor,overviewZoom(),maxZoom);
      update();
      const after = ground(sx, sy, false);
      if (before && after) center(x + before.x - after.x, y + before.y - after.y);
    },
    reveal(px, py) {
      const point = project(px, py);
      if (!point.visible || point.x < 12 || point.x > width - 12 || point.y < 12 || point.y > height - 12) center(px, py);
    }
  };
}

export function actorSize(actor, tower) {
  if (tower) return [LOOP_FOOTPRINT.width / 2, LOOP_FOOTPRINT.height / 2, 68];
  if (actor.boss) return [29, 29, 83];
  return actor.elite ? [19, 19, 47] : [13, 13, 34];
}

export function pickActor(ray, state) {
  if (!ray) return null;
  let closest = Infinity, hit = null;
  for (const [kind, units] of [['tower', state.towers], ['enemy', state.enemies]]) {
    for (const unit of units) {
      if (kind === 'enemy' && unit.hp <= 0) continue;
      const [halfWidth, halfDepth, height] = actorSize(unit, kind === 'tower');
      const min = [unit.x - halfWidth, -unit.y - halfDepth, 0];
      const max = [unit.x + halfWidth, -unit.y + halfDepth, height];
      let near = 0, far = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const origin = ray.origin[axis], along = ray.direction[axis];
        if (Math.abs(along) < 1e-8) {
          if (origin < min[axis] || origin > max[axis]) far = -1;
          continue;
        }
        const a = (min[axis] - origin) / along, b = (max[axis] - origin) / along;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
      if (near <= far && near < closest) {
        closest = near;
        hit = {kind, id:unit.id, x:unit.x, y:unit.y};
      }
    }
  }
  return hit;
}
