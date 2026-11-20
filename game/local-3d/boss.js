export const YOSHINO_FILES = ['Yoshino.MDx','Yoshino.blp','YoshinoMagic.blp'];
const assetNames = YOSHINO_FILES.map(name=>name.toLowerCase());
const clips = {stand:'Stand', walk:'Walk', channel:'Spell Two', death:'Death'};

export async function findLocalYoshino() {
  if (!['localhost','127.0.0.1','[::1]'].includes(globalThis.location?.hostname)) return null;
  const signal = AbortSignal.timeout(4000);
  const responses = await Promise.all(YOSHINO_FILES.map(name=>fetch(
    new URL(`./local-model/${name}`,import.meta.url),{signal,mode:'same-origin',cache:'no-store'}
  )));
  if (responses.some(response=>response.status!==200)) return null;
  return Promise.all(responses.map(async (response,index)=>new File([await response.blob()],YOSHINO_FILES[index])));
}

export async function loadYoshino(files, library) {
  const byName = new Map(Array.from(files,file=>[file.name.toLowerCase(),file]));
  if (byName.size !== 3 || !assetNames.every(name=>byName.has(name))) {
    throw Error('请一起选择 Yoshino.MDx、Yoshino.blp 和 YoshinoMagic.blp。');
  }
  if (Array.from(byName.values()).some(file=>file.size < 20 || file.size > 16*1024*1024)) {
    throw Error('模型或贴图文件大小无效。');
  }
  const [mdx,...blps] = await Promise.all(assetNames.map(name=>byName.get(name).arrayBuffer()));
  const header = new DataView(mdx);
  if (header.getUint32(0,false) !== 0x4d444c58) throw Error('无法读取 MDX 模型。');
  const model = library.parseMDX(mdx);
  const indexes = Object.fromEntries(Object.entries(clips).map(([key,name])=>[key,model.Sequences.findIndex(sequence=>sequence.Name===name)]));
  if (model.Version !== 800 || Object.values(indexes).some(index=>index<0)) throw Error('模型缺少四糸乃的经典版动作。');
  const textures = new Map();
  for (const texture of model.Textures) {
    if (!texture.Image) continue;
    const index = assetNames.indexOf(texture.Image.toLowerCase().split(/[\\/]/).pop())-1;
    if (index < 0) throw Error(`缺少贴图 ${texture.Image}。`);
    const image = library.decodeBLP(blps[index]);
    if (image.width > 2048 || image.height > 2048) throw Error('贴图尺寸超过 2048 × 2048。');
    const data = library.getBLPImageData(image,0);
    const canvas = document.createElement('canvas');
    canvas.width = data.width; canvas.height = data.height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.data),data.width,data.height),0,0);
    textures.set(texture.Image,canvas);
  }
  if (textures.size !== 2) throw Error('模型的两张贴图未能匹配。');
  return {model,indexes,textures};
}

export function createYoshinoRenderer(gl,library,{mat4,quat},asset) {
  const {model,indexes,textures} = asset;
  const renderer = new library.ModelRenderer(model);
  // war3-model 4.0.1 tears down HD shader slots even for classic models.
  const dropShader = renderer.destroyShaderProgramObject?.bind(renderer);
  if (dropShader) renderer.destroyShaderProgramObject = program => { if (program) dropShader(program); };
  try {
    renderer.initGL(gl);
    renderer.setTeamColor([.16,.70,.95]);
    for (const [name,texture] of textures) renderer.setTextureImage(name,texture);
  } catch (error) {
    renderer.destroy();
    throw error;
  }

  const matrix = mat4.create(), rotation = quat.create();
  return {
    draw(camera,entity,elapsed,deathAge = null) {
      const scale = entity.boss || entity.code?.startsWith('B') ? .44
        : entity.elite || entity.code?.startsWith('E') ? .27 : .19;
      const channel = entity.channel;
      const key = deathAge !== null ? 'death' : channel ? 'channel' : entity.actualSpeed > 0 ? 'walk' : 'stand';
      const index = indexes[key], [start,end] = model.Sequences[index].Interval;
      const length = end-start;
      if (deathAge !== null && deathAge*1000 >= length) return;
      const phase = deathAge !== null ? deathAge*1000
        : channel ? (elapsed-channel.start)/(channel.until-channel.start)*length
        : key === 'walk' ? (entity.progress||0)*20 % length : elapsed*1000 % length;
      renderer.setSequence(index);
      renderer.setFrame(start+Math.floor(Math.max(0,Math.min(length-1,phase))));
      const angle = entity.angle||0, c = Math.cos(angle), s = Math.sin(angle);
      const x = (camera.eye[0]-entity.x)/scale, y = (camera.eye[1]+entity.y)/scale;
      quat.setAxisAngle(rotation,[0,0,1],angle);
      quat.multiply(rotation,rotation,camera.rotation);
      renderer.setCamera([x*c-y*s,x*s+y*c,camera.eye[2]/scale],rotation);
      renderer.update(0);
      mat4.translate(matrix,camera.view,[entity.x,-entity.y,0]);
      mat4.rotateZ(matrix,matrix,-angle);
      mat4.scale(matrix,matrix,[scale,scale,scale]);
      renderer.render(matrix,camera.projection,{wireframe:false});
    },
    dispose:()=>renderer.destroy()
  };
}
