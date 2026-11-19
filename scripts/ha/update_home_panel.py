"""Installs a release of the Home panel from GitHub, run by Home Assistant itself.

Home Assistant calls this through a `shell_command` (see examples/update-from-github.yaml), so the files are written by
the machine that serves them and nothing has to reach into the config folder from outside. It:
  1. asks the GitHub API for the release (the latest, or the tag given) and its home-panel.zip asset
  2. streams the zip into a staging folder <config>/www/.home-panel-staging-*, checks it against the asset's sha256
     digest (a release without one is refused) and unzips it there: same disk, so the swap below is renames only
  3. moves the old build (home-panel.js and its .gz/.br/.map, chunks/, fonts/, LICENSES.md, and any name the new build
     has) aside and the new one into place, then keeps the old one as <config>/home-panel-backup/; every other file in
     the folder (your house pictures, other libraries) stays. A failure during the swap puts the old build back.
  4. sets `?v=` on the panel's `module_url:` line in configuration.yaml to the new version, so browsers drop their
     31-day copy, and only then records the version in www/home-panel/.release

Home Assistant kills a shell_command after 60 seconds, which no `finally` survives. So the network work has a deadline
well inside that, checked before the swap starts; the swap itself is a handful of renames.

It must not touch anything else under <config>: not .storage, not the database, no other line of configuration.yaml.
It never restarts Home Assistant; panel_custom reads module_url at start-up, so the new build shows after a restart.
Standard library only: it runs on the Python that ships inside Home Assistant.

Prints one JSON object on stdout (the shell_command's response) and exits non-zero on failure, leaving the old build
in place.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile

REPO = 'pldelisle/ha-home-panel'
ASSET = 'home-panel.zip'
# what a build puts in the panel's folder; anything else there belongs to the owner and is left alone
BUILD_FILES = ('home-panel.js', 'home-panel.js.gz', 'home-panel.js.br', 'home-panel.js.map', 'LICENSES.md')
BUILD_DIRS = ('chunks', 'fonts')
# the file in the panel's folder that names the installed version, so a second run with nothing new does nothing
VERSION_FILE = '.release'
# the same version shape as scripts/sync-version.mjs, but only on a `module_url:` line that is not commented out
VERSION_QUERY = re.compile(
    r'^(\s*-?\s*module_url:\s*/local/home-panel/home-panel\.js\?v=)'
    r'\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![0-9A-Za-z-]|\.\d)',
    re.MULTILINE,
)
TAG = re.compile(r'v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?')
# seconds: Home Assistant stops the command at 60, the swap must start well before that
NETWORK_TIMEOUT = 15
DEADLINE = 40


def open_url(url, accept):
    request = urllib.request.Request(url, headers={'Accept': accept, 'User-Agent': 'ha-home-panel-updater'})
    return urllib.request.urlopen(request, timeout=NETWORK_TIMEOUT)


def find_release(tag):
    if tag and not TAG.fullmatch(tag):
        raise RuntimeError(f'not a release tag: {tag!r}')
    path = 'tags/' + urllib.parse.quote(tag if tag.startswith('v') else 'v' + tag) if tag else 'latest'
    with open_url(f'https://api.github.com/repos/{REPO}/releases/{path}', 'application/vnd.github+json') as response:
        release = json.load(response)
    asset = next((a for a in release['assets'] if a['name'] == ASSET), None)
    if asset is None:
        raise RuntimeError(f'release {release["tag_name"]} has no {ASSET}')
    return release['tag_name'].removeprefix('v'), asset


def download(asset, staging):
    """Streams the asset to a file while hashing it, so the archive never sits in memory whole."""
    digest = asset.get('digest') or ''
    if not digest.startswith('sha256:'):
        raise RuntimeError(f'the release gives no sha256 digest for {ASSET}; refusing an unchecked download')
    archive_path = os.path.join(staging, ASSET)
    sha256 = hashlib.sha256()
    with open_url(asset['browser_download_url'], 'application/octet-stream') as response, open(archive_path, 'wb') as file:
        while chunk := response.read(1 << 16):
            sha256.update(chunk)
            file.write(chunk)
    if sha256.hexdigest() != digest.removeprefix('sha256:'):
        raise RuntimeError(f'{ASSET} does not match its sha256 digest')
    return archive_path


def unpack(archive_path, staging):
    root = os.path.join(staging, 'build')
    # extractall drops absolute paths and '..' parts, so no entry lands outside root
    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(root)
    if not os.path.isfile(os.path.join(root, 'home-panel.js')):
        raise RuntimeError(f'{ASSET} has no home-panel.js at its root')
    return root


def swap(build, panel_dir, staging, backup_dir):
    """Moves the old build into staging, the new one in, and only then replaces the previous backup."""
    incoming = os.listdir(build)
    old_build = os.path.join(staging, 'old')
    os.makedirs(old_build)
    moved_out, moved_in = [], []
    try:
        for name in dict.fromkeys(BUILD_FILES + BUILD_DIRS + tuple(incoming)):
            old = os.path.join(panel_dir, name)
            if os.path.lexists(old):
                os.replace(old, os.path.join(old_build, name))
                moved_out.append(name)
        for name in incoming:
            os.replace(os.path.join(build, name), os.path.join(panel_dir, name))
            moved_in.append(name)
    except BaseException:
        for name in moved_in:
            shutil.move(os.path.join(panel_dir, name), os.path.join(build, name))
        for name in moved_out:
            os.replace(os.path.join(old_build, name), os.path.join(panel_dir, name))
        raise
    shutil.rmtree(backup_dir, ignore_errors=True)
    os.replace(old_build, backup_dir)


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
    started = time.monotonic()

    panel_dir = os.path.join(args.config, 'www', 'home-panel')
    version, asset = find_release(args.tag.strip())
    previous = installed_version(panel_dir)
    if previous == version and not args.force:
        return {'status': 'up_to_date', 'version': version}

    os.makedirs(panel_dir, exist_ok=True)
    www = os.path.join(args.config, 'www')
    # a staging folder left by a run that Home Assistant killed
    for name in os.listdir(www):
        if name.startswith('.home-panel-staging-'):
            shutil.rmtree(os.path.join(www, name), ignore_errors=True)
    staging = tempfile.mkdtemp(dir=www, prefix='.home-panel-staging-')
    try:
        build = unpack(download(asset, staging), staging)
        if time.monotonic() - started > DEADLINE:
            raise RuntimeError('the download took too long to swap safely before Home Assistant stops the command; run it again')
        swap(build, panel_dir, staging, os.path.join(args.config, 'home-panel-backup'))
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    found = bump_module_url(os.path.join(args.config, 'configuration.yaml'), version)
    # written last: a run that failed before this point is not mistaken for an installed version next time
    with open(os.path.join(panel_dir, VERSION_FILE), 'w', encoding='utf-8') as file:
        file.write(version + '\n')
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
