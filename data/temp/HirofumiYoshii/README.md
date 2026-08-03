# 埼玉県 熊出没情報マップ

埼玉県公式「ツキノワグマ出没マップ」の背後にあるArcGIS FeatureServer（Survey123回答データ、
匿名クエリ可）から埼玉県内の熊（クマ）出没情報を取得し、MapLibre GL JS 上でインタラクティブに
可視化・フィルタリング・データ出力できる静的Webアプリです。
フレームワーク不使用（Vanilla JS + CDNライブラリのみ）で、GitHub Pages にそのまま公開できます。

## 使い方

### ローカルで動かす

FeatureServer への `fetch` はブラウザの `file://` プロトコルからは CORS 制限で失敗することがあるため、
簡易HTTPサーバー経由で開いてください。

```bash
# このディレクトリで実行
python -m http.server 8000
# または
npx serve .
```

ブラウザで `http://localhost:8000` を開きます。

### GitHub Pages で公開する

このディレクトリ（`index.html` を含むフォルダ）をそのまま GitHub Pages の公開対象に設定するだけで動作します。
外部通信は以下のみです。

- CDN（Tailwind CSS / MapLibre GL JS / Tabulator / Lucide Icons）
- 埼玉県公式 ArcGIS FeatureServer（`services9.arcgis.com`、データ取得時のみ）
- 国土地理院タイル（`cyberjapandata.gsi.go.jp`、地図表示のみ）

## 画面構成

- **サイドバー**: 期間・季節・月別・時間帯（チェックボックス＋24時間スライダー）フィルター、表示設定
- **地図**: ズームレベルに応じてヒートマップ⇔サークル表示を自動切替（サイドバーでON/OFF可）。ポイントクリックで詳細ポップアップ表示
- **下部パネル**:
  - 「出没データ一覧」タブ: フィルター適用後の全件をテーブル表示。GeoJSON / CSV ダウンロード可
  - 「市町村別集計」タブ: 出没回数ランキング。集計CSVダウンロード可

## データについて（重要な制約）

- 埼玉県公式「ツキノワグマ出没マップ（公開用）」ダッシュボードの背後にある ArcGIS FeatureServer
  （Survey123回答データ、匿名クエリ可・`Query,Extract` capability）から取得した実データです。
  出典: https://www.pref.saitama.lg.jp/dx-portal/info/kumashutsubotsu.html
- 「出没日時」は各自治体からの報告に含まれる「出没日」フィールドを使用し、「出没時間」フィールド
  （HH:MM形式、未入力の場合あり）があれば時刻も反映します。時刻が無い場合は日付のみのフィルター対象になります。
- 「市町村名」は報告データ内の市町村名フィールドをそのまま使用しています（座標からの推定ではありません）。
- 一覧テーブルの `詳細情報` 列には、地名・出没状況の概要・出没頭数・被害状況・出没レベル・
  各自治体の対応状況等、報告データに含まれる項目をそのまま表示しています。
- APIが一時的に混雑・失敗している場合に備え、サイドバーに **「サンプルデータで動作確認」** トグルを
  用意しています。ONにすると秩父地方周辺に生成したデモ用の架空データ（実際の出没情報ではありません）
  が表示され、UIの動作確認に使えます。

## ファイル構成

```
web/
├── index.html        # メインUI（ダッシュボード・地図・テーブル・コントローラー）
├── css/
│   └── style.css     # カスタムスタイル
└── js/
    ├── app.js        # 初期化・イベントハンドリング
    ├── saitama-api.js # 埼玉県公式APIクエリ生成・データ取得・GeoJSON変換
    ├── map.js        # MapLibre GL JS 初期化・レイヤー描画・フィルター反映
    └── table.js       # テーブル表示・集計・CSV/GeoJSONダウンロード
```

## 技術スタック

- MapLibre GL JS（地図） + 国土地理院タイル
- Tailwind CSS（CDN）
- Tabulator.js（テーブル）
- Lucide Icons
