import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, "..", "build");

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir);
}

const size = 1024;

const svg = `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4A90D9"/>
      <stop offset="100%" style="stop-color:#2E5FA1"/>
    </linearGradient>
    <linearGradient id="pulse" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#5FFFB0"/>
      <stop offset="100%" style="stop-color:#3DDC84"/>
    </linearGradient>
  </defs>

  <!-- 角丸背景 -->
  <rect x="40" y="40" width="944" height="944" rx="180" fill="url(#bg)"/>

  <!-- ドキュメント -->
  <path d="M280 180 H620 L744 304 V844 H280 Z" fill="white" opacity="0.95" rx="20"/>
  <!-- 折り返し -->
  <path d="M620 180 V304 H744" fill="none" stroke="white" stroke-width="2" opacity="0.5"/>
  <path d="M620 180 L744 304 H620 Z" fill="white" opacity="0.75"/>

  <!-- テキスト行 -->
  <rect x="340" y="350" width="280" height="18" rx="9" fill="#4A90D9" opacity="0.4"/>
  <rect x="340" y="400" width="340" height="18" rx="9" fill="#4A90D9" opacity="0.3"/>
  <rect x="340" y="450" width="200" height="18" rx="9" fill="#4A90D9" opacity="0.3"/>

  <!-- パルス波形 -->
  <polyline
    points="160,620 320,620 380,620 420,480 470,760 520,520 560,680 600,620 680,620 860,620"
    fill="none"
    stroke="url(#pulse)"
    stroke-width="36"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <!-- パルス影 -->
  <polyline
    points="160,620 320,620 380,620 420,480 470,760 520,520 560,680 600,620 680,620 860,620"
    fill="none"
    stroke="#3DDC84"
    stroke-width="36"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.3"
    transform="translate(0, 8)"
  />
</svg>
`;

async function main() {
  const pngPath = path.join(buildDir, "icon.png");

  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  console.log(`icon.png saved (${size}x${size})`);

  // 各サイズのPNGを生成（electron-builder用）
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
  for (const s of sizes) {
    await sharp(Buffer.from(svg))
      .resize(s, s)
      .png()
      .toFile(path.join(buildDir, `icon_${s}x${s}.png`));
  }
  console.log("All sizes generated");
}

main().catch(console.error);
