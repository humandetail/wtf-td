import {createServer} from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {homedir} from 'node:os';
import {YOSHINO_FILES} from '../game/local-3d/boss.js';
import {SAMPLE_MODEL_FILES} from '../game/local-3d/sample-models.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
if(!['127.0.0.1','0.0.0.0'].includes(host))throw new Error('HOST 必须为127.0.0.1或0.0.0.0');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须为 1–65535 的整数');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const roots = await Promise.all(['game', 'outputs'].map(name => realpath(resolve(root, name))));
const vendor = new Map([
  ['/game/local-3d/vendor/gl-matrix.js','node_modules/gl-matrix/gl-matrix-min.js'],
  ['/game/local-3d/vendor/war3-model.js','node_modules/war3-model/dist/war3-model.browser.js']
]);
const inside = (file, directory) => file === directory || file.startsWith(directory + sep);
const localModel = new Map([
  ...YOSHINO_FILES.map(name=>[`/game/local-3d/local-model/${name}`,['四糸乃',name]]),
  ...SAMPLE_MODEL_FILES.map(name=>[`/game/local-3d/local-model/${name}`,['环界模型样例',name]])
]);
const loopback = new Set(['127.0.0.1','::ffff:127.0.0.1','::1']);
const libraryFolder = resolve(homedir(),'Downloads','环界模型库');
const libraryRoute = '/game/local-3d/local-library/';
const libraryAsset = /^assets\/[a-f0-9]{64}\.(mdx|mdl|blp|png|jpe?g|gif|webp)$/;
const server = createServer(async (request, response) => {
  const finish = (status, message = '') => {
    response.writeHead(status, {'Content-Type':'text/plain; charset=utf-8'});
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (!['GET','HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return finish(405, '不支持此请求方式');
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const modelPath = pathname.startsWith(libraryRoute) ? pathname.slice(libraryRoute.length) : null;
    if (modelPath !== null || localModel.has(pathname)) {
      const fromLocalPage = loopback.has(request.socket.remoteAddress)
        && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? '')
        && request.headers['sec-fetch-site'] === 'same-origin';
      if (!fromLocalPage) return finish(404);
      if (modelPath !== null && modelPath !== 'catalog.json' && !libraryAsset.test(modelPath)) return finish(404);
      const local = localModel.get(pathname);
      const modelFolder = local ? resolve(homedir(),'Downloads',local[0]) : libraryFolder;
      const name = local ? local[1] : modelPath;
      const file = await realpath(resolve(modelFolder,name)).catch(()=>null);
      if (!file || !inside(file,modelFolder)) return finish(204);
      const info = await stat(file);
      if (!info.isFile() || info.size > 16*1024*1024) return finish(204);
      const contents = await readFile(file);
      response.writeHead(200,{'Content-Type':modelPath==='catalog.json' ? mime['.json'] : 'application/octet-stream',
        'Content-Length':contents.length,'Cache-Control':libraryAsset.test(name) ? 'private, max-age=86400' : 'no-store',
        'Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'});
      response.end(request.method === 'HEAD' ? undefined : contents);
      return;
    }
    if (vendor.has(pathname)) {
      const contents = await readFile(resolve(root,vendor.get(pathname)));
      response.writeHead(200,{'Content-Type':mime['.js'],'Content-Length':contents.length,'X-Content-Type-Options':'nosniff'});
      response.end(request.method === 'HEAD' ? undefined : contents);
      return;
    }
    if (pathname === '/') {
      response.writeHead(302, {Location:'/game/'});
      return response.end();
    }
    if (pathname.split('/').some(part => part.startsWith('.')) || (!pathname.startsWith('/game/') && !pathname.startsWith('/outputs/') && pathname !== '/favicon.ico')) return finish(404, '未找到文件');
    let file = resolve(root, '.' + pathname);
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    file = await realpath(file);
    if (!roots.some(directory => inside(file, directory)) && file !== resolve(root, 'favicon.ico')) return finish(404, '未找到文件');
    const contents = await readFile(file);
    response.writeHead(200, {'Content-Type':mime[extname(file).toLowerCase()] || 'application/octet-stream','Content-Length':contents.length,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    finish(error instanceof URIError ? 400 : 404, '未找到文件');
  }
});
server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`环界已启动：http://127.0.0.1:${port}/game/\n${host==='0.0.0.0'?'手机可通过本机局域网IP访问相同端口。\n':''}按 Ctrl+C 停止服务。`));
