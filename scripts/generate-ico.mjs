import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, "..", "build");

// ICOフォーマットを手動で構築
async function createIco(pngPaths, outputPath) {
  const images = [];
  for (const p of pngPaths) {
    const buf = fs.readFileSync(p);
    const meta = await sharp(buf).metadata();
    images.push({ data: buf, width: meta.width, height: meta.height });
  }

  // ICOヘッダー: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);          // reserved
  header.writeUInt16LE(1, 2);          // type: ICO
  header.writeUInt16LE(images.length, 4); // count

  // 各エントリ: 16 bytes
  const entries = [];
  let dataOffset = 6 + images.length * 16;

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);    // color palette
    entry.writeUInt8(0, 3);    // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(img.data.length, 8); // size
    entry.writeUInt32LE(dataOffset, 12);     // offset
    entries.push(entry);
    dataOffset += img.data.length;
  }

  const result = Buffer.concat([header, ...entries, ...images.map(i => i.data)]);
  fs.writeFileSync(outputPath, result);
}

const sizes = [16, 32, 48, 64, 128, 256];
const pngPaths = sizes.map(s => path.join(buildDir, `icon_${s}x${s}.png`));

await createIco(pngPaths, path.join(buildDir, "icon.ico"));
console.log("icon.ico saved");
