import { WORLD, ROAD_SEGMENTS, ROAD_WIDTH } from '../geometry.js';
import { towerVisual } from '../battle-visuals.js';
import { loopTower } from '../loop-catalog.js';

const VERTEX = `#version 300 es
layout(location=0) in vec4 vertex;
layout(location=1) in vec3 center;
layout(location=2) in vec3 size;
layout(location=3) in vec2 turn;
layout(location=4) in vec3 tint;
uniform mat4 viewProjection;
out vec3 color;
out vec2 uv;
void main() {
  vec3 p = vertex.xyz * size;
  p.xy = mat2(turn.x, turn.y, -turn.y, turn.x) * p.xy;
  gl_Position = viewProjection * vec4(center + p, 1.0);
  color = tint * vertex.w;
  uv = vec2(vertex.x + .5, .5 - vertex.y);
}`;
const FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D ground;
uniform bool textured;
in vec3 color;
in vec2 uv;
out vec4 pixel;
void main() {
  pixel = vec4(textured ? texture(ground, uv).rgb * color : color, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
  return shader;
}

function solidMeshes() {
  const floor = [], box = [], prism = [], crystal = [];
  const tri = (list, a, b, c, light) => list.push(...a, light, ...b, light, ...c, light);
  const quad = (list, a, b, c, d, light) => { tri(list,a,b,c,light); tri(list,a,c,d,light); };
  const a = [-.5,-.5,0], b = [.5,-.5,0], c = [.5,.5,0], d = [-.5,.5,0];
  const top = point => [point[0],point[1],1];
  quad(floor,a,b,c,d,1);
  quad(box,top(a),top(b),top(c),top(d),1);
  [[a,b,.75],[b,c,.89],[c,d,.63],[d,a,.71]].forEach(([p,q,light]) => quad(box,p,q,top(q),top(p),light));
  for (let side = 0; side < 8; side++) {
    const angle = side * Math.PI / 4;
    const ring = (r, t, z) => [r*Math.cos(t),r*Math.sin(t),z];
    const p = ring(.5,angle,0), q = ring(.5,angle+Math.PI/4,0);
    const s = ring(.4,angle,1), t = ring(.4,angle+Math.PI/4,1);
    const shade = .75 + Math.sin(angle)*.15;
    quad(prism,p,q,t,s,shade);
    tri(prism,s,t,[0,0,1],1);
    tri(crystal,ring(.5,angle,.42),ring(.5,angle+Math.PI/4,.42),[0,0,1],shade+.12);
    tri(crystal,ring(.5,angle+Math.PI/4,.42),ring(.5,angle,.42),[0,0,0],shade-.12);
  }
  return {floor, box, prism, crystal};
}

function batch(gl, vertices) {
  const vao = gl.createVertexArray(), mesh = gl.createBuffer(), actors = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(0);
  gl.bindBuffer(gl.ARRAY_BUFFER,actors);
  for (const [location,size,offset] of [[1,3,0],[2,3,12],[3,2,24],[4,3,32]]) {
    gl.vertexAttribPointer(location,size,gl.FLOAT,false,44,offset);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribDivisor(location,1);
  }
  gl.bindVertexArray(null);
  return {
    draw(data) {
      if (!data.length) return;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER,actors);
      gl.bufferData(gl.ARRAY_BUFFER,data instanceof Float32Array ? data : new Float32Array(data),gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLES,0,vertices.length/4,data.length/11);
    },
    dispose() { gl.deleteVertexArray(vao); gl.deleteBuffer(mesh); gl.deleteBuffer(actors); }
  };
}

const add = (items,x,y,z,w,d,h,angle,color) => items.push(x,-y,z,w,d,h,Math.cos(angle),Math.sin(angle),...color);
const colors = new Map();
function rgb(hex) {
  if (!colors.has(hex)) {
    const n = Number.parseInt(hex.slice(1,7),16);
    colors.set(hex,[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]);
  }
  return colors.get(hex);
}

export function createScene(gl) {
  const program = gl.createProgram();
  const vert = compile(gl,gl.VERTEX_SHADER,VERTEX), frag = compile(gl,gl.FRAGMENT_SHADER,FRAGMENT);
  gl.attachShader(program,vert); gl.attachShader(program,frag); gl.linkProgram(program);
  gl.deleteShader(vert); gl.deleteShader(frag);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  const transform = gl.getUniformLocation(program,'viewProjection');
  const textured = gl.getUniformLocation(program,'textured');
  const sampler = gl.getUniformLocation(program,'ground');
  const meshes = Object.fromEntries(Object.entries(solidMeshes()).map(([kind,vertices])=>[kind,batch(gl,vertices)]));
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  let groundImage = null;
  const floor = [], roads = [], surroundings = [];
  add(surroundings,WORLD.width/2,WORLD.height/2,-3,WORLD.width+3600,WORLD.height+3600,1,0,[.11,.17,.13]);
  add(floor,WORLD.width/2,WORLD.height/2,-1,WORLD.width,WORLD.height,1,0,[.33,.43,.35]);
  for (const {x1,y1,x2,y2} of ROAD_SEGMENTS) {
    add(roads,(x1+x2)/2,(y1+y2)/2,0,Math.abs(x2-x1)||ROAD_WIDTH,Math.abs(y2-y1)||ROAD_WIDTH,1,0,[.46,.42,.33]);
  }
  const landscape = new Float32Array(floor), paths = new Float32Array(roads), terrain = new Float32Array(surroundings);
  const stone = [.22,.30,.31], steel = [.40,.54,.55];
  return {
    draw(camera,state,image,hasEnemyModel) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      gl.clearColor(.040,.071,.063,1);
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(transform,false,camera.combined);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      if (image && image !== groundImage) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);
        groundImage = image;
        landscape.set([.93,.94,.92],8);
      }
      gl.uniform1i(sampler,0);
      gl.uniform1i(textured,0);
      meshes.floor.draw(terrain);
      gl.uniform1i(textured,Number(!!groundImage));
      meshes.floor.draw(landscape);
      gl.uniform1i(textured,0);
      if (!groundImage) meshes.floor.draw(paths);

      const boxes = [], prisms = [], crystals = [];
      for (const tower of state.towers) {
        const {x,y,code,level} = tower, angle = -(tower.angle||0);
        const color = rgb(towerVisual(code).color);
        const role = loopTower(code)?.role;
        add(boxes,x,y,0,57,33,11,0,stone);
        add(prisms,x,y,11,32,32,25+level*3,angle,steel);
        if (role === 'support' || role === 'control') add(crystals,x,y,33,31,31,28,angle,color);
        else {
          add(boxes,x,y,32,31,23,17,angle,color);
          add(boxes,x+Math.cos(angle)*16,y-Math.sin(angle)*16,40,36,9,8,angle,steel);
        }
      }
      for (const enemy of hasEnemyModel ? [] : state.enemies) {
        if (enemy.hp <= 0) continue;
        const {x,y} = enemy, angle = -(enemy.angle||0);
        const size = enemy.boss ? 2.1 : enemy.elite ? 1.33 : 1;
        const visual = enemy.hidden ? '#63827b' : enemy.special === 'gold' ? '#ffce60'
          : enemy.boss ? '#ed9269' : enemy.elite ? '#c083c6'
          : enemy.healer ? '#83d7a7' : enemy.armor > 0 ? '#ad9c7d' : '#c67168';
        add(prisms,x,y,0,23*size,19*size,20*size,angle,rgb(visual));
        add(crystals,x+Math.cos(angle)*4*size,y-Math.sin(angle)*4*size,12*size,20*size,20*size,20*size,angle,rgb(visual));
      }
      meshes.box.draw(boxes); meshes.prism.draw(prisms); meshes.crystal.draw(crystals);
      gl.bindVertexArray(null);
    },
    dispose() {
      for (const mesh of Object.values(meshes)) mesh.dispose();
      gl.deleteTexture(texture); gl.deleteProgram(program);
    }
  };
}
