# Markview Pulse

Markdownファイルをリアルタイムにプレビューするデスクトップアプリです（macOS / Windows / Linux対応）。ファイルの変更を即座に検知して表示を更新し、変更箇所をインライン差分で確認できます。

## ダウンロード

[最新リリース](https://github.com/beex-okamura/markview-pulse/releases/latest)からお使いのOS向けのファイルをダウンロードしてください。

| OS | ファイル |
|---|---|
| macOS (Apple Silicon) | `.dmg` |
| Windows | `.exe` |
| Linux | `.AppImage` / `.deb` |

## スクリーンショット

### ライトモード
![ライトモード](screenshots/light.png)

### ダークモード
![ダークモード](screenshots/dark.png)

### 差分表示
![差分表示](screenshots/diff.png)

## 機能一覧

- Markdownファイルのリアルタイムプレビュー
- ファイル変更の自動検知・表示更新
- インライン差分表示（追加: 緑 / 削除: 赤+取り消し線）
- ダークモード対応（OSのシステム設定に連動）
- ファイルのドラッグ&ドロップ
- 最近開いたファイルの履歴
- 印刷 / PDF書き出し
- テーブル表示（罫線付き・横スクロール対応）
- スクロール位置の保持（ファイル更新時）
- `.md` ファイル関連付け

## 必要な環境

- Node.js 20 以上
- npm

## インストール手順

```bash
git clone https://github.com/beex-okamura/markview-pulse.git
cd markview-pulse
npm install
```

## ビルド・パッケージング

```bash
# TypeScriptコンパイルのみ
npm run build

# ローカル環境向けにパッケージング
npm run pack

# インストーラーを生成（dmg / exe / AppImage / deb）
npm run dist
```

## 使い方

### 起動方法

```bash
# コマンドラインからファイルを指定して起動
npx electron . ファイル.md

# 開発用（test.mdを開く）
npm run dev
```

- **ファイル関連付け**:
  - **macOS**: Finderで `.md` ファイルを右クリック →「情報を見る」→「このアプリケーションで開く」で `Markview Pulse` を選択 →「すべてを変更」
  - **Windows**: `.md` ファイルを右クリック →「プログラムから開く」→「別のプログラムを選択」で `Markview Pulse` を選択 →「常にこのアプリを使って.mdファイルを開く」にチェック
  - **Linux**: インストール時に自動で関連付けされます
- **ドラッグ&ドロップ**: アプリのウィンドウに `.md` ファイルをドロップ

### キーボードショートカット

| ショートカット | 機能 |
|---|---|
| `Cmd/Ctrl + P` | 印刷 |
| `Cmd/Ctrl + Shift + S` | PDF書き出し |
| `Cmd/Ctrl + +` | 拡大 |
| `Cmd/Ctrl + -` | 縮小 |
| `Cmd/Ctrl + 0` | 実際のサイズ |

### 差分表示

ファイルが更新されると、右下に差分表示のトグルボタンが表示されます。

- ボタンをクリックすると、前回との差分がインラインで表示されます
  - 緑背景: 追加された部分
  - 赤背景+取り消し線: 削除された部分
- もう一度クリックすると通常表示に戻ります

## 開発

### 開発環境セットアップ

```bash
npm install
npm run build
```

### テストの実行

Playwrightを使用したE2Eテストです。

```bash
npm test
```

### プロジェクト構成

```
watch-markdown/
├── src/
│   ├── main.ts        # Electronメインプロセス（ファイル読み込み・監視・差分生成）
│   ├── preload.ts     # IPC通信のブリッジ
│   ├── renderer.ts    # 表示・差分切り替え・ドラッグ&ドロップ
│   ├── index.html     # ビューアのHTML
│   └── style.css      # スタイル（ライト/ダークモード・差分表示）
├── test/
│   └── app.test.ts    # E2Eテスト（Playwright）
├── dist/              # コンパイル済みJS / パッケージング出力
├── package.json
├── tsconfig.json
└── playwright.config.ts
```

## 技術スタック

- [Electron](https://www.electronjs.org/) - デスクトップアプリフレームワーク
- [TypeScript](https://www.typescriptlang.org/) - 型付きJavaScript
- [marked](https://marked.js.org/) - Markdown→HTML変換
- [diff](https://github.com/kpdecker/jsdiff) - テキスト差分検出
- [Playwright](https://playwright.dev/) - E2Eテスト
- [electron-builder](https://www.electron.build/) - パッケージング

## ライセンス

ISC
