"""Installs a release of the Home panel from GitHub, run by Home Assistant itself.

Home Assistant calls this through a `shell_command` (see examples/update-from-github.yaml), so the files are written by
the machine that serves them and nothing has to reach into the config folder from outside. It:
  1. asks the GitHub API for the release (the latest, or the tag given) and its home-panel.zip asset
  2. downloads the zip and checks it against the asset's sha256 digest, then unzips it into a staging folder beside
     the panel's folder (same disk, so the swap below is a rename)
  3. moves the old build (home-panel.js and its .gz/.br/.map, chunks/, fonts/, LICENSES.md) to <config>/home-panel-backup/
     and the new one into place; every other file in the folder (your house pictures, other libraries) stays
  4. sets `?v=` on the panel's module_url in configuration.yaml to the new version, so browsers drop their 31-day copy

It must not touch anything else under <config>: not .storage, not the database, no other line of configuration.yaml.
It never restarts Home Assistant; panel_custom reads module_url at start-up, so the new build shows after a restart.
Standard library only: it runs on the Python that ships inside Home Assistant.

Prints one JSON object on stdout (the shell_command's response) and exits non-zero on failure, leaving the old build
in place when the failure comes before the swap.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.request
import zipfile

REPO = 'pldelisle/ha-home-panel'
ASSET = 'home-panel.zip'
# what a build puts in the panel's folder; anything else there belongs to the owner and is left alone
BUILD_FILES = ('home-panel.js', 'home-panel.js.gz', 'home-panel.js.br', 'home-panel.js.map', 'LICENSES.md')
BUILD_DIRS = ('chunks', 'fonts')
# the file in the panel's folder that names the installed version, so a second run with nothing new does nothing
VERSION_FILE = '.release'
# same shape as scripts/sync-version.mjs: only the panel's own module URL, semver with an optional suffix
VERSION_QUERY = re.compile(r'(home-panel\.js\?v=)\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![0-9A-Za-z-]|\.\d)')


def fetch(url, accept):
    request = urllib.request.Request(url, headers={'Accept': accept, 'User-Agent': 'ha-home-panel-updater'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def find_release(tag):
    path = f'tags/{tag}' if tag else 'latest'
    release = json.loads(fetch(f'https://api.github.com/repos/{REPO}/releases/{path}', 'application/vnd.github+json'))
    asset = next((a for a in release['assets'] if a['name'] == ASSET), None)
    if asset is None:
        raise RuntimeError(f'release {release["tag_name"]} has no {ASSET}')
    return release['tag_name'].removeprefix('v'), asset


def download(asset):
    data = fetch(asset['browser_download_url'], 'application/octet-stream')
    digest = asset.get('digest') or ''
    if digest.startswith('sha256:') and hashlib.sha256(data).hexdigest() != digest.removeprefix('sha256:'):
        raise RuntimeError(f'{ASSET} does not match its sha256 digest')
    return data


def unpack(data, staging):
    archive_path = os.path.join(staging, ASSET)
    with open(archive_path, 'wb') as archive:
        archive.write(data)
    root = os.path.join(staging, 'build')
    with zipfile.ZipFile(archive_path) as archive:
        for name in archive.namelist():
            # a name that climbs out of the folder (../, an absolute path) would write outside it
            target = os.path.realpath(os.path.join(root, name))
            if not target.startswith(os.path.realpath(root) + os.sep):
                raise RuntimeError(f'{ASSET} holds a path outside its folder: {name}')
        archive.extractall(root)
    if not os.path.isfile(os.path.join(root, 'home-panel.js')):
        raise RuntimeError(f'{ASSET} has no home-panel.js at its root')
    return root


def swap(build, panel_dir, backup_dir):
    shutil.rmtree(backup_dir, ignore_errors=True)
    os.makedirs(backup_dir)
    for name in BUILD_FILES + BUILD_DIRS:
        old = os.path.join(panel_dir, name)
        if os.path.lexists(old):
            shutil.move(old, os.path.join(backup_dir, name))
    for name in os.listdir(build):
        shutil.move(os.path.join(build, name), os.path.join(panel_dir, name))


def bump_module_url(config_path, version):
    """Returns whether the line was found. Writes a temporary file and renames it, so a crash leaves the old file."""
    with open(config_path, encoding='utf-8') as file:
        text = file.read()
    updated, count = VERSION_QUERY.subn(lambda match: match.group(1) + version, text)
    if count == 0:
        return False
    if updated != text:
        handle, temporary = tempfile.mkstemp(dir=os.path.dirname(config_path), prefix='.configuration.', suffix='.yaml')
        with os.fdopen(handle, 'w', encoding='utf-8') as file:
            file.write(updated)
        shutil.copymode(config_path, temporary)
        os.replace(temporary, config_path)
    return True


def installed_version(panel_dir):
    try:
        with open(os.path.join(panel_dir, VERSION_FILE), encoding='utf-8') as file:
            return file.read().strip()
    except FileNotFoundError:
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--tag', default='', help='a release tag such as v2.20.0 (default: the latest release)')
    parser.add_argument('--config', default='/config', help="Home Assistant's config folder")
    parser.add_argument('--force', action='store_true', help='install even when this version is installed already')
    args = parser.parse_args()

    panel_dir = os.path.join(args.config, 'www', 'home-panel')
    version, asset = find_release(args.tag.strip())
    previous = installed_version(panel_dir)
    if previous == version and not args.force:
        return {'status': 'up_to_date', 'version': version}

    os.makedirs(panel_dir, exist_ok=True)
    staging = tempfile.mkdtemp(dir=os.path.join(args.config, 'www'), prefix='.home-panel-staging-')
    try:
        build = unpack(download(asset), staging)
        swap(build, panel_dir, os.path.join(args.config, 'home-panel-backup'))
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    with open(os.path.join(panel_dir, VERSION_FILE), 'w', encoding='utf-8') as file:
        file.write(version + '\n')
    found = bump_module_url(os.path.join(args.config, 'configuration.yaml'), version)
    return {
        'status': 'installed',
        'version': version,
        'previous': previous,
        'module_url_updated': found,
        'next': 'restart Home Assistant, then reload the panel',
    }


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except Exception as error:  # the shell_command's response carries the reason; Home Assistant logs the exit code
        print(json.dumps({'status': 'failed', 'error': str(error)}))
        sys.exit(1)
