#!/usr/bin/env python3
"""Retain verified release images and configuration for encrypted off-host backup."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

FILES = ('.env', 'docker-compose.yml', 'db-init.sh', 'Caddyfile')
OPTIONAL_FILES = ('route.json', 'movement-runtime.json', 'preparation.json', 'fleet.json')

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()

def run(args):
    result = subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=1800)
    return result.stdout

def private_file(path):
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents) or not path.is_file():
        raise ValueError('release input must be a regular file')
    return path.read_bytes()

def write(path, data):
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(descriptor)
    finally: os.close(descriptor)

def validate_release(release, pointer):
    index = json.loads(private_file(release / 'index.json'))
    manifest = json.loads(private_file(release / 'release.json'))
    identity = {'target': pointer['target'], 'manifest': manifest, 'images': index['images']}
    if (index.get('version') != 1 or manifest.get('version') != 1
            or index.get('target') != pointer['target']
            or index.get('releaseSha') != pointer['releaseSha']
            or manifest.get('sha') != pointer['releaseSha']
            or hashlib.sha256(canonical(identity)).hexdigest() != pointer['release']
            or not index['images']
            or any(image not in manifest['images'].values() for image in index['images'])
            or any(not re.fullmatch('sha256:[a-f0-9]{64}', value) for value in index['images'].values())
            or (release / 'images.tar').is_symlink()
            or digest(release / 'images.tar') != index['imagesSha256']):
        raise ValueError('release image archive integrity check failed')
    return index

def create(bundle, destination, target):
    manifest = json.loads(private_file(bundle / 'release.json'))
    if manifest.get('version') != 1 or not re.fullmatch('[a-f0-9]{40}', manifest.get('sha', '')):
        raise ValueError('a verified immutable release manifest is required')
    if not re.fullmatch('[a-z][a-z0-9-]{0,62}', target):
        raise ValueError('invalid installation target')
    images = sorted(set(run(['docker', 'compose', '--profile', '*', '--project-directory', str(bundle), '-f', str(bundle / 'docker-compose.yml'), 'config', '--images']).decode().splitlines()))
    if (bundle / 'fleet.json').exists():
        fleet = json.loads(private_file(bundle / 'fleet.json'))
        if fleet.get('version') != 1 or fleet['registry']['target'] != target:
            raise ValueError('runtime fleet belongs to another target')
        images = sorted(set(images) | set(fleet['images']))
    if not images or any(image not in manifest['images'].values() or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.:/_-]*@sha256:[a-f0-9]{64}', image) for image in images):
        raise ValueError('every installed image must be pinned by the verified manifest')
    recovered = json.loads(private_file(bundle / 'restored-images.json')) if (bundle / 'restored-images.json').exists() else None
    if recovered and (recovered.get('version') != 1 or recovered.get('target') != target):
        raise ValueError('recovered image map belongs to another target')
    mapping = {}
    for image in images:
        try: image_id = run(['docker', 'image', 'inspect', '--format', '{{.Id}}', image]).decode().strip()
        except subprocess.CalledProcessError:
            image_id = (recovered or {}).get('images', {}).get(image)
            if not isinstance(image_id, str) or not re.fullmatch('sha256:[a-f0-9]{64}', image_id):
                raise ValueError('retained image is not available locally')
            if run(['docker', 'image', 'inspect', '--format', '{{.Id}}', image_id]).decode().strip() != image_id:
                raise ValueError('recovered image identity differs')
        mapping[image] = image_id
    if any(not re.fullmatch('sha256:[a-f0-9]{64}', value) for value in mapping.values()):
        raise ValueError('could not resolve an installed image')
    release_id = hashlib.sha256(canonical({'target': target, 'manifest': manifest, 'images': mapping})).hexdigest()
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    if destination.is_symlink() or destination.stat().st_mode & 0o077:
        raise ValueError('release archive must be a private directory')
    release = destination / release_id
    config = {name: private_file(bundle / name) for name in FILES}
    config.update({name: private_file(bundle / name) for name in OPTIONAL_FILES if (bundle / name).exists() or (bundle / name).is_symlink()})
    if (bundle / '.env').stat().st_mode & 0o077:
        raise ValueError('release credentials must be private')
    config_id = hashlib.sha256(canonical({name: hashlib.sha256(data).hexdigest() for name, data in config.items()})).hexdigest()
    if not release.exists():
        stage = Path(tempfile.mkdtemp(prefix='.preparing-', dir=destination))
        try:
            run(['docker', 'image', 'save', '--output', str(stage / 'images.tar'), *sorted(set(mapping.values()))])
            os.chmod(stage / 'images.tar', 0o600)
            with (stage / 'images.tar').open('rb') as stream: os.fsync(stream.fileno())
            write(stage / 'release.json', canonical(manifest))
            write(stage / 'index.json', canonical({'version': 1, 'target': target, 'releaseSha': manifest['sha'], 'images': mapping, 'imagesSha256': digest(stage / 'images.tar')}))
            sync_directory(stage)
            stage.rename(release)
            sync_directory(destination)
        finally:
            if stage.exists(): shutil.rmtree(stage)
    validate_release(release, {'target': target, 'releaseSha': manifest['sha'], 'release': release_id})
    configs = release / 'configurations'
    configs.mkdir(mode=0o700, exist_ok=True)
    if not (configs / config_id).exists():
        stage = Path(tempfile.mkdtemp(prefix='.preparing-', dir=configs))
        try:
            for name, data in config.items(): write(stage / name, data)
            write(stage / 'checksums.json', canonical({name: hashlib.sha256(data).hexdigest() for name, data in config.items()}))
            sync_directory(stage)
            stage.rename(configs / config_id)
            sync_directory(configs)
        finally:
            if stage.exists(): shutil.rmtree(stage)
    pointer = canonical({'version': 1, 'target': target, 'release': release_id, 'configuration': config_id, 'releaseSha': manifest['sha']})
    with tempfile.NamedTemporaryFile(dir=destination, prefix='.current-', delete=False) as stream:
        os.chmod(stream.name, 0o600)
        stream.write(pointer); stream.flush(); os.fsync(stream.fileno())
        pending = Path(stream.name)
    pending.replace(destination / 'current.json')
    sync_directory(destination)
    print('Release images and private configuration retained for backup.')

def restore(archive, destination, target):
    pointer = json.loads(private_file(archive / 'current.json'))
    if pointer.get('version') != 1 or pointer.get('target') != target or any(not re.fullmatch('[a-f0-9]{64}', pointer.get(key, '')) for key in ('release', 'configuration')):
        raise ValueError('release archive belongs to another target or is invalid')
    release = archive / pointer['release']
    index = validate_release(release, pointer)
    config = release / 'configurations' / pointer['configuration']
    checksums = json.loads(private_file(config / 'checksums.json'))
    if (hashlib.sha256(canonical(checksums)).hexdigest() != pointer['configuration']
            or not set(FILES).issubset(checksums) or not set(checksums).issubset((*FILES, *OPTIONAL_FILES))):
        raise ValueError('release configuration integrity check failed')
    content = {name: private_file(config / name) for name in checksums}
    if any(hashlib.sha256(content[name]).hexdigest() != checksums[name] for name in checksums):
        raise ValueError('release configuration integrity check failed')
    if destination.exists():
        raise ValueError('release recovery destination must be new')
    run(['docker', 'image', 'load', '--input', str(release / 'images.tar')])
    for image_id in index['images'].values():
        if run(['docker', 'image', 'inspect', '--format', '{{.Id}}', image_id]).decode().strip() != image_id:
            raise ValueError('restored image identity differs')
    destination.mkdir(mode=0o700, parents=True)
    for name, data in content.items(): write(destination / name, data)
    # These non-secret bind-mounted inputs must be readable by their service UIDs.
    for name in ('db-init.sh', 'Caddyfile'): (destination / name).chmod(0o644)
    # Docker save/load retains config digests, which are immutable local image references.
    compose = json.loads(run(['docker', 'compose', '--profile', '*', '--project-directory', str(destination), 'config', '--format', 'json']))
    for service in compose['services'].values():
        service['image'] = index['images'][service['image']]
        service['pull_policy'] = 'never'
    write(destination / 'release.json', private_file(release / 'release.json'))
    write(destination / 'restored-images.json', canonical({'version': 1, 'target': target, 'images': index['images']}))
    # Compose config already escapes literal dollars for a subsequent Compose parse.
    write(destination / 'restored-compose.json', canonical(compose))
    sync_directory(destination)
    sync_directory(destination.parent)
    print('Retained release restored locally. Verify the target and restore its databases before admission.')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('create', 'restore'))
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--target', required=True)
    args=parser.parse_args()
    os.umask(0o077)
    (create if args.action == 'create' else restore)(args.source.resolve(), args.destination.absolute(), args.target)

if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError, json.JSONDecodeError):
        raise SystemExit('Release archival or recovery failed; existing recovery material is preserved.')
