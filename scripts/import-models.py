"""Extract the model pack into a local catalog for the 3D game."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
from itertools import takewhile
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import struct
import subprocess
from tempfile import NamedTemporaryFile, TemporaryDirectory
from zipfile import BadZipFile, ZipFile

MODELS = {'.mdx', '.mdl', '.obj', '.max', '.mb', '.fbx', '.glb', '.gltf'}
TEXTURES = {'.blp', '.png', '.jpg', '.jpeg', '.webp', '.tga', '.dds', '.bmp', '.gif'}
ARCHIVES = {'.zip', '.rar', '.7z'}
LIMIT = 16 * 1024 * 1024


def archive_path(name):
    path = PurePosixPath(name.replace('\\', '/'))
    if not path.parts or path.is_absolute() or '..' in path.parts or ':' in path.parts[0]:
        raise ValueError(f'压缩包路径无效：{name}')
    return path


def zip_files(archive, directory):
    with ZipFile(archive) as source:
        for entry in source.infolist():
            relative = archive_path(entry.filename)
            suffix = relative.suffix.lower()
            if (entry.is_dir() or '__MACOSX' in relative.parts or relative.name.startswith('._')
                    or stat.S_ISLNK(entry.external_attr >> 16)
                    or suffix not in MODELS | TEXTURES | ARCHIVES):
                continue
            limit = 512 * 1024 * 1024 if suffix in ARCHIVES else LIMIT
            if entry.file_size > limit:
                raise ValueError(f'文件过大：{relative}')
            target = directory / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(entry) as reader, target.open('wb') as writer:
                shutil.copyfileobj(reader, writer)


def nested_files(archive, directory, seven_zip):
    if archive.suffix.lower() == '.zip':
        zip_files(archive, directory)
        return
    if not seven_zip:
        raise ValueError('RAR 和 7z 需要 7zz 或 7z')
    listed = subprocess.run([seven_zip, 'l', '-slt', '-ba', '-sccUTF-8', str(archive)],
                            capture_output=True, check=True, text=True, stdin=subprocess.DEVNULL)
    for line in listed.stdout.splitlines():
        if line.startswith('Path = '):
            archive_path(line.removeprefix('Path = '))
        if line.startswith(('Symbolic Link = ', 'Hard Link = ')):
            raise ValueError('压缩包包含链接')
    patterns = [f'-ir!*{suffix}' for suffix in sorted(MODELS | TEXTURES | ARCHIVES)]
    subprocess.run([seven_zip, 'x', '-y', '-ssc-', '-bb0', '-bso0', '-bsp0', f'-o{directory}',
                    str(archive), *patterns], capture_output=True, check=True, stdin=subprocess.DEVNULL)


def discover(archive, scratch, seven_zip, errors, prefix='', depth=0):
    if depth > 8:
        raise ValueError('压缩包嵌套超过八层')
    with TemporaryDirectory(dir=scratch) as temporary:
        directory = Path(temporary)
        nested_files(archive, directory, seven_zip)
        for file in sorted(directory.rglob('*')):
            if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(directory.resolve()):
                continue
            source = prefix + file.relative_to(directory).as_posix()
            suffix = file.suffix.lower()
            if suffix in ARCHIVES:
                try:
                    yield from discover(file, scratch, seven_zip, errors, source + '!/', depth+1)
                except (BadZipFile, OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
                    detail = getattr(error, 'stderr', None) or str(error)
                    if isinstance(detail, bytes):
                        detail = detail.decode(errors='replace')
                    errors.append({'source': source, 'reason': detail.strip()[-400:]})
            elif suffix in MODELS | TEXTURES and file.stat().st_size <= LIMIT:
                yield source, file.read_bytes()


def mdx_metadata(data):
    if not data.startswith(b'MDLX'):
        raise ValueError('MDX 文件头无效')
    version, drawable, geometry = None, False, False
    textures, clips = [], []
    offset = 4
    while offset+8 <= len(data):
        tag, size = struct.unpack_from('<4sI', data, offset)
        start = offset+8
        offset = start+size
        if offset > len(data):
            raise ValueError('MDX 数据块截断')
        if tag == b'VERS' and size >= 4:
            version, = struct.unpack_from('<I', data, start)
        if tag in {b'GEOS', b'PRE2', b'RIBB'} and size:
            drawable = True
        if tag == b'GEOS' and size:
            geometry = True
        if tag == b'TEXS':
            for pos in range(start, offset-267, 268):
                name = data[pos+4:pos+264].split(b'\0', 1)[0].decode('utf-8', errors='replace')
                if name:
                    textures.append(name)
        if tag == b'SEQS':
            for pos in range(start, offset-131, 132):
                clips.append(data[pos:pos+80].split(b'\0', 1)[0].decode('utf-8', errors='replace'))
    return version, textures, clips, drawable, geometry


def model_metadata(data, suffix):
    if suffix == '.mdx':
        return mdx_metadata(data)
    if suffix == '.mdl':
        text = data.decode('utf-8', errors='replace')
        version = re.search(r'FormatVersion\s+(\d+)', text)
        geometry = bool(re.search(r'\bGeoset\s*\{', text))
        drawable = geometry or bool(re.search(r'\b(?:ParticleEmitter2|RibbonEmitter)\b', text))
        return (int(version[1]) if version else None, re.findall(r'Image\s+"([^"]+)"', text),
                re.findall(r'Anim\s+"([^"]+)"', text), drawable, geometry)
    raise ValueError(f'{suffix[1:].upper()} 源文件需要转换')


def texture_file(source, reference, textures):
    parent = PurePosixPath(source).parent.parts
    reference_path = PurePosixPath(reference.replace('\\', '/').casefold())
    candidates = textures.get(reference_path.name, [])
    ranked = defaultdict(set)
    for candidate, asset in candidates:
        parts = PurePosixPath(candidate.casefold()).parts
        same_folder = tuple(part.casefold() for part in parent) == parts[:-1]
        matching_folder = len(tuple(takewhile(lambda pair: pair[0].casefold() == pair[1], zip(parent, parts[:-1]))))
        exact_path = parts[-len(reference_path.parts):] == reference_path.parts
        ranked[(same_folder, exact_path, matching_folder)].add(asset)
    if not ranked:
        return None
    closest = ranked[max(ranked)]
    return next(iter(closest)) if len(closest) == 1 else None


def store(directory, data, suffix):
    key = sha256(data).hexdigest() + suffix
    target = directory / key
    if target.is_file():
        return key
    with NamedTemporaryFile(dir=directory, delete=False) as output:
        temporary = Path(output.name)
        output.write(data)
    try:
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return key


def prepare_texture(data, suffix, temp):
    if suffix not in {'.tga', '.dds', '.bmp'}:
        return data, suffix
    sips = shutil.which('sips')
    if not sips:
        return None
    source = temp / ('texture' + suffix)
    target = temp / 'texture.png'
    source.write_bytes(data)
    converted = subprocess.run([sips, '-s', 'format', 'png', str(source), '--out', str(target)], capture_output=True)
    if converted.returncode == 0:
        return target.read_bytes(), '.png'
    return None


def import_models(archive, destination, seven_zip):
    destination.mkdir(parents=True, exist_ok=True)
    assets = destination / 'assets'
    assets.mkdir(exist_ok=True)
    errors, models, textures = [], [], defaultdict(list)
    with TemporaryDirectory() as scratch:
        for source, data in discover(archive, scratch, seven_zip, errors):
            path = PurePosixPath(source)
            suffix = path.suffix.lower()
            if suffix in TEXTURES:
                prepared = prepare_texture(data, suffix, Path(scratch))
                if prepared:
                    textures[path.name.casefold()].append((source, store(assets, *prepared)))
                continue
            asset = store(assets, data, suffix)
            parts = path.parts
            model = {'id': sha256(source.encode()).hexdigest()[:24], 'source': source, 'name': path.stem,
                     'group': parts[1].removesuffix('!') if len(parts) > 2 else '其他',
                     'asset': asset, 'size': len(data), 'format': suffix[1:]}
            try:
                version, references, clips, drawable, geometry = model_metadata(data, suffix)
                model.update(version=version, clips=clips, drawable=drawable, geometry=geometry)
                model['references'] = list(dict.fromkeys(references))
                if version != 800:
                    model['issue'] = '需要转换为经典版模型'
                elif not drawable:
                    model['issue'] = '模型依赖外部对象或没有可直接绘制的几何／粒子'
            except ValueError as error:
                model['issue'] = str(error)
            models.append(model)
    for model in models:
        model['textures'] = {}
        model['missing'] = []
        for reference in model.pop('references', []):
            asset = texture_file(model['source'], reference, textures)
            if asset:
                model['textures'][reference] = asset
            else:
                model['missing'].append(reference)
    if errors:
        for error in errors:
            print(error['source'], error['reason'])
        raise SystemExit(f'{len(errors)} 个子包未展开，保留已有索引。')
    catalog = {'models': sorted(models, key=lambda model: model['source'])}
    with TemporaryDirectory(dir=destination) as temporary:
        output = Path(temporary) / 'catalog.json'
        output.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        output.replace(destination / 'catalog.json')
    print('模型', dict(Counter(model['format'] for model in models)),
          '贴图待补', sum(bool(model['missing']) for model in models),
          '暂不可预览', sum('issue' in model for model in models))


if __name__ == '__main__':
    downloads = Path.home() / 'Downloads'
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path, nargs='?', default=downloads / '模型.zip')
    parser.add_argument('--destination', type=Path, default=downloads / '环界模型库')
    parser.add_argument('--seven-zip', default=shutil.which('7zz') or shutil.which('7z'))
    args = parser.parse_args()
    import_models(args.archive.resolve(), args.destination.resolve(), args.seven_zip)
