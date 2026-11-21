import { findLocalModelFiles, loadClassicModel } from './boss.js';

const samples = [
  {
    code:'X13', files:['heishuixuanshe.mdx','heishuixuanshe.blp'],
    clips:{stand:'Stand',walk:'Walk',channel:'Spell',death:'Death'},scale:.16,elevation:2
  },
  {
    code:'T05', files:['lightningrod.mdx','mogu_lightningrod.blp','glow.blp'],
    clips:{stand:'Stand'},scale:.53,elevation:11
  }
];

export const SAMPLE_MODEL_FILES = samples.flatMap(sample=>sample.files);

export async function loadSampleModels(library) {
  const loaded = await Promise.allSettled(samples.map(async ({code,files:names,clips,scale,elevation})=>{
    const files = await findLocalModelFiles(names);
    if (!files) return null;
    const byName = new Map(files.map(file=>[file.name.toLowerCase(),file]));
    const asset = await loadClassicModel(files[0],byName,library,clips,scale,elevation);
    return /** @type {const} */ ([code,asset]);
  }));
  const models = new Map();
  for (const result of loaded) {
    if (result.status === 'rejected') console.warn('样例模型载入失败',result.reason);
    else if (result.value) models.set(...result.value);
  }
  return models;
}
