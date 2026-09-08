#!/usr/bin/env python3
"""Start a prepared runtime and retain its recovery material before admitting customers."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import prepare

archive = prepare.archive


def directory(path, uid=0):
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
        raise ValueError('runtime storage cannot use symbolic links')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not path.is_dir() or path.stat().st_mode & 0o077:
        raise ValueError('runtime storage must be a private directory')
    os.chown(path, uid, uid)


def install_controller(image, destination, release_sha):
    if destination.exists():
        if archive.private_file(destination / 'release-sha').decode().strip() != release_sha:
            raise ValueError('installed movement controller belongs to another release')
        return
    stage = Path(tempfile.mkdtemp(prefix='.preparing-controller-', dir=destination.parent))
    container = None
    try:
        container = archive.run(['docker', 'create', '--network', 'none', image]).decode().strip()
        if not re.fullmatch('[a-f0-9]{64}', container):
            raise ValueError('could not select the controller image')
        for source, target in (('/usr/local/bin/bun', 'bun'), ('/app/build', 'build'),
                               ('/app/components', 'components'), ('/app/artifact-migrations', 'artifact-migrations'),
                               ('/app/release-sha', 'release-sha')):
            archive.run(['docker', 'cp', '-L', f'{container}:{source}', str(stage / target)])
        if archive.private_file(stage / 'release-sha').decode().strip() != release_sha:
            raise ValueError('verified image does not contain the expected release controller')
        (stage / 'bun').chmod(0o500)
        stage.rename(destination)
    finally:
        if container: archive.run(['docker', 'rm', container])
        if stage.exists(): shutil.rmtree(stage)


def start(bundle, target):
    if os.geteuid() != 0:
        raise ValueError('runtime startup requires the installation administrator')
    identity = prepare.verify_prepared(bundle)
    if identity['version'] != 1 or identity['target'] != target:
        raise ValueError('runtime belongs to another target')
    runtime_id = identity['id']
    if not re.fullmatch('[a-z][a-z0-9-]{0,23}', runtime_id):
        raise ValueError('invalid runtime identity')
    # Root-owned local lock serializes startup retries; customer movement has its own database journal.
    with (bundle / '.start-lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        manifest = json.loads(archive.private_file(bundle / 'release.json'))
        composition = json.loads(archive.private_file(bundle / 'docker-compose.yml'))
        images = sorted({service['image'] for service in composition['services'].values()})
        if manifest['sha'] != identity['releaseSha'] or any(image not in manifest['images'].values() for image in images):
            raise ValueError('prepared image identity differs')
        for image in images:
            # Explicit immutable pulls precede startup; Compose itself cannot select another image.
            recovered_file = bundle / 'restored-images.json'
            recovered = json.loads(archive.private_file(recovered_file)) if recovered_file.exists() else None
            if recovered:
                if recovered['target'] != target or image not in recovered['images']:
                    raise ValueError('recovered runtime image differs from its archive')
                expected = recovered['images'][image]
                if archive.run(['docker', 'image', 'inspect', '--format', '{{.Id}}', expected]).decode().strip() != expected:
                    raise ValueError('recovered runtime image is unavailable')
            else:
                archive.run(['docker', 'pull', image])
        network = json.loads(archive.run(['docker', 'network', 'inspect', identity['controlNetwork']]))[0]
        if not network.get('Internal'):
            raise ValueError('control network must be internal')
        storage = Path(identity['dataRoot']) / runtime_id
        directory(storage)
        directory(storage / 'postgres', 70)
        directory(storage / 'backups', 65532)
        health_root = Path(identity['dataRoot']).parent / 'runtime-backup-health'
        for path, uid in ((health_root, 0), (health_root / runtime_id, 65532)):
            if path.is_symlink() or any(parent.is_symlink() for parent in path.parents):
                raise ValueError('runtime health storage cannot use symbolic links')
            path.mkdir(mode=0o755, parents=True, exist_ok=True)
            os.chmod(path, 0o755); os.chown(path, uid, uid)
        compose = ['docker', 'compose', '--project-directory', str(bundle)]
        archive.run([*compose, 'up', '--detach', '--pull', 'never', '--wait', '--wait-timeout', '240'])
        controller_image = manifest['images']['PLATFORM_PROVISIONER_IMAGE']
        install_controller(recovered['images'][controller_image] if recovered else controller_image, bundle / 'controller', manifest['sha'])
        archive.create(bundle, storage / 'release-archive', target)
        # Only the operations UID reads the archive, through a read-only container mount.
        for parent, directories, files in os.walk(storage / 'release-archive', followlinks=False):
            for path in [Path(parent), *(Path(parent) / name for name in directories + files)]:
                if path.is_symlink(): raise ValueError('release archive contains a symbolic link')
                os.chown(path, 65532, 65532)
        archive.run([*compose, '--profile', 'backup', 'up', '--detach', '--pull', 'never',
                     '--wait', '--wait-timeout', '300', f'{runtime_id}-backup'])
    print(f'Runtime {runtime_id} is running with an encrypted release backup. Customer placement is unchanged.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle', type=Path)
    parser.add_argument('--target', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    start(args.bundle.absolute(), args.target)


if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        raise SystemExit('Runtime startup failed; prepared files and databases are retained. Repair the cause and repeat startup.')
