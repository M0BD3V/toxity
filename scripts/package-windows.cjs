const { spawnSync } = require('node:child_process');
const { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shell = process.platform === 'win32';

function run(command, args) {
  return spawnSync(command, args, { cwd: root, stdio: 'inherit', shell });
}

let result = run('npm', ['run', 'build']);
if (result.status !== 0) process.exit(result.status ?? 1);

result = run('npx', ['electron-builder', '--win', 'nsis']);
if (result.status === 0) process.exit(0);

const electronRuntime = path.join(root, 'node_modules', 'electron', 'dist');
if (!existsSync(path.join(electronRuntime, 'electron.exe'))) process.exit(result.status ?? 1);

console.warn('\nO Windows bloqueou a extração do Builder; montando o pacote Toxity localmente.');
const unpackedApp = path.join(root, 'release', 'toxity-win-x64');
const releaseRoot = path.join(root, 'release') + path.sep;
if (!unpackedApp.startsWith(releaseRoot)) throw new Error('Diretório de staging inválido.');
rmSync(unpackedApp, { recursive: true, force: true });
mkdirSync(unpackedApp, { recursive: true });
cpSync(electronRuntime, unpackedApp, { recursive: true, force: true });

const genericExecutable = path.join(unpackedApp, 'electron.exe');
const toxityExecutable = path.join(unpackedApp, 'Toxity.exe');
renameSync(genericExecutable, toxityExecutable);

const rcedit = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
const icon = path.join(root, 'assets', 'brand', 'icons', 'toxity.ico');
if (existsSync(rcedit)) {
  const metadata = spawnSync(rcedit, [
    toxityExecutable,
    '--set-icon', icon,
    '--set-version-string', 'ProductName', 'Toxity',
    '--set-version-string', 'FileDescription', 'Toxity Desktop',
    '--set-version-string', 'InternalName', 'Toxity',
    '--set-version-string', 'OriginalFilename', 'Toxity.exe',
  ], { cwd: root, stdio: 'inherit' });
  if (metadata.status !== 0) process.exit(metadata.status ?? 1);
}

const appRoot = path.join(unpackedApp, 'resources', 'app');
mkdirSync(appRoot, { recursive: true });
cpSync(path.join(root, 'dist'), path.join(appRoot, 'dist'), { recursive: true, force: true });
cpSync(path.join(root, 'electron'), path.join(appRoot, 'electron'), { recursive: true, force: true });
cpSync(path.join(root, 'assets'), path.join(appRoot, 'assets'), { recursive: true, force: true });
writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({
  name: 'toxity',
  version: require(path.join(root, 'package.json')).version,
  productName: 'Toxity',
  main: 'electron/main.cjs',
}, null, 2));

result = run('npx', ['electron-builder', '--win', 'nsis', '--prepackaged', unpackedApp]);
process.exit(result.status ?? 1);
