const sharp = require('sharp');
const { mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = process.cwd();
  const svgDir = path.join(root, 'assets', 'brand', 'svg');
  const pngDir = path.join(root, 'assets', 'brand', 'png');
  const iconDir = path.join(root, 'assets', 'brand', 'icons');
  await Promise.all([mkdir(pngDir, { recursive: true }), mkdir(iconDir, { recursive: true })]);

  const symbol = await readFile(path.join(svgDir, 'toxity-symbol.svg'));
  const mono = await readFile(path.join(svgDir, 'toxity-symbol-mono.svg'));
  const horizontal = await readFile(path.join(svgDir, 'toxity-logo-horizontal.svg'));
  const campaign = await readFile(path.join(svgDir, 'toxity-campaign-lockup.svg'));
  const horizontalLight = Buffer.from(horizontal.toString().replaceAll('#F5F7FA', '#0D0F14'));

  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    await sharp(symbol).resize(size, size).png().toFile(path.join(iconDir, `toxity-${size}.png`));
  }

  await sharp(symbol).resize(1024, 1024).png().toFile(path.join(pngDir, 'toxity-symbol-transparent.png'));
  await sharp(symbol).flatten({ background: '#0D0F14' }).resize(1024, 1024).png().toFile(path.join(pngDir, 'toxity-symbol-dark.png'));
  await sharp(symbol).flatten({ background: '#F5F7FA' }).resize(1024, 1024).png().toFile(path.join(pngDir, 'toxity-symbol-light.png'));
  await sharp(mono).resize(1024, 1024).png().toFile(path.join(pngDir, 'toxity-symbol-monochrome.png'));
  await sharp(horizontal).resize({ width: 1600 }).png().toFile(path.join(pngDir, 'toxity-logo-horizontal-transparent.png'));
  await sharp(horizontal).flatten({ background: '#0D0F14' }).resize({ width: 1600 }).png().toFile(path.join(pngDir, 'toxity-logo-horizontal-dark.png'));
  await sharp(horizontalLight).flatten({ background: '#F5F7FA' }).resize({ width: 1600 }).png().toFile(path.join(pngDir, 'toxity-logo-horizontal-light.png'));
  await sharp(campaign).resize({ width: 1600 }).png().toFile(path.join(pngDir, 'toxity-campaign-lockup.png'));

  console.log('Brand PNG exports generated successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
