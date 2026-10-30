import {createServer} from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须为 1–65535 的整数');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const roots = await Promise.all(['game', 'outputs'].map(name => realpath(resolve(root, name))));
const inside = (file, directory) => file === directory || file.startsWith(directory + sep);
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
server.listen(port, '127.0.0.1', () => console.log(`环界已启动：http://127.0.0.1:${port}/game/\n按 Ctrl+C 停止服务。`));
