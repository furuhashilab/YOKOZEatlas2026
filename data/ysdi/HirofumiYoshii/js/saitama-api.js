/**
 * saitama-api.js
 * 埼玉県公式「ツキノワグマ出没マップ」の背後にあるArcGIS FeatureServer
 * （Survey123回答データ、匿名クエリ可）へのデータ取得・標準GeoJSON変換を担当する。
 * グローバル名前空間 `SaitamaBearService` として公開する（モジュールバンドラ非依存の構成のため）。
 *
 * 出典: 埼玉県ツキノワグマ出没マップ（公開用）
 * https://www.pref.saitama.lg.jp/dx-portal/info/kumashutsubotsu.html
 */
(function (global) {
  "use strict";

  const FEATURE_SERVER_QUERY_URL =
    "https://services9.arcgis.com/n65w8AXGaYPTqFYI/arcgis/rest/services/survey123_3123e5ed452d4e89845e4ba6129c1e2d_results/FeatureServer/0/query";

  const YEARS_BACK = 5;
  const REQUEST_TIMEOUT_MS = 20000;
  const PAGE_SIZE = 1000; // FeatureServer の maxRecordCount に合わせたページサイズ

  async function queryPage(offset) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      outSR: "4326",
      f: "geojson",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${FEATURE_SERVER_QUERY_URL}?${params}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`埼玉県公式データ取得エラー: HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error(`タイムアウト (${REQUEST_TIMEOUT_MS / 1000}秒)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchAllRawFeatures(onProgress) {
    let all = [];
    let offset = 0;
    while (true) {
      onProgress?.(`埼玉県公式データ（ツキノワグマ出没情報）を取得しています... (${all.length}件取得済み)`);
      const page = await queryPage(offset);
      const feats = page.features || [];
      all = all.concat(feats);
      if (feats.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return all;
  }

  // ---- 日時・時間帯の推定 -------------------------------------------------

  function parseTimeOfDayField(raw) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
    if (!m) return null;
    return { hour: Number(m[1]), minute: Number(m[2]) };
  }

  function classifyTimeOfDay(date, hasTime) {
    if (!hasTime) return "unknown";
    const h = date.getHours();
    if (h >= 5 && h < 10) return "morning";
    if (h >= 10 && h < 16) return "daytime";
    if (h >= 16 && h < 19) return "evening";
    return "night";
  }

  function classifySeason(month /* 1-12 */) {
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
  }

  const TIME_OF_DAY_LABEL = {
    morning: "朝",
    daytime: "昼",
    evening: "夕方",
    night: "夜間",
    unknown: "不明",
  };

  // ---- 要素 -> 標準化GeoJSON Feature 変換 ---------------------------------

  function buildDetail(p) {
    const detail = {};
    if (p.field_6) detail["地名"] = p.field_6;
    if (p.field_9) detail["出没状況の概要"] = p.field_9;
    if (p.field_10 !== null && p.field_10 !== undefined) detail["出没頭数"] = p.field_10;
    if (p.field_11) detail["被害状況"] = p.field_11;
    if (p.field_17) detail["出没レベル"] = p.field_17;
    if (p.field_13) detail["報告者所属"] = p.field_13;
    if (p.field_12) detail["各自治体の対応状況"] = p.field_12;
    if (p.field_15) detail["備考"] = p.field_15;
    if (p.field_14) detail["出没年度"] = p.field_14;
    return detail;
  }

  function rawFeaturesToStandard(rawFeatures) {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - YEARS_BACK);

    const features = [];
    let seq = 1;
    for (const rf of rawFeatures) {
      const [lon, lat] = rf.geometry?.coordinates || [];
      if (lat === undefined || lon === undefined) continue;

      const p = rf.properties || {};
      if (!p.field_1) continue; // 出没日が無いレコードは対象外

      const dateOnly = new Date(p.field_1);
      if (dateOnly < cutoff || dateOnly > now) continue;

      const time = parseTimeOfDayField(p.field_2);
      const hasTime = !!time;
      const dt = new Date(dateOnly);
      if (hasTime) dt.setHours(time.hour, time.minute, 0, 0);

      const timeOfDay = classifyTimeOfDay(dt, hasTime);
      const season = classifySeason(dateOnly.getMonth() + 1);

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          id: `saitama-${p.objectid}`,
          source_id: p.objectid,
          datetime: dt.toISOString(),
          date_source: hasTime ? "field" : "date_only",
          has_time: hasTime,
          time_of_day: timeOfDay,
          time_of_day_label: TIME_OF_DAY_LABEL[timeOfDay],
          season,
          municipality: p.field_4 || "不明",
          lat,
          lon,
          tags: buildDetail(p),
          seq: seq++,
        },
      });
    }
    return features;
  }

  // ---- デモ用サンプルデータ（API に実データが無い場合の動作確認用） ----

  function generateSampleData() {
    const chichibuArea = [
      { name: "秩父市", lat: 35.99, lon: 139.08 },
      { name: "秩父市", lat: 35.94, lon: 138.98 },
      { name: "小鹿野町", lat: 36.02, lon: 138.93 },
      { name: "横瀬町", lat: 35.96, lon: 139.13 },
      { name: "皆野町", lat: 36.05, lon: 139.10 },
      { name: "長瀞町", lat: 36.11, lon: 139.11 },
      { name: "飯能市", lat: 35.86, lon: 139.10 },
      { name: "飯能市", lat: 35.90, lon: 139.05 },
      { name: "東秩父村", lat: 36.03, lon: 139.18 },
      { name: "秩父市", lat: 35.90, lon: 138.90 },
    ];
    const now = Date.now();
    const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000;
    const features = [];
    for (let i = 0; i < 60; i++) {
      const base = chichibuArea[i % chichibuArea.length];
      const lat = base.lat + (Math.random() - 0.5) * 0.06;
      const lon = base.lon + (Math.random() - 0.5) * 0.06;
      const dt = new Date(now - Math.random() * fiveYearsMs);
      const hour = Math.floor(Math.random() * 24);
      dt.setHours(hour, Math.floor(Math.random() * 60));
      const timeOfDay = classifyTimeOfDay(dt, true);
      const season = classifySeason(dt.getMonth() + 1);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          id: `sample-${i + 1}`,
          source_id: i + 1,
          datetime: dt.toISOString(),
          date_source: "sample",
          has_time: true,
          time_of_day: timeOfDay,
          time_of_day_label: TIME_OF_DAY_LABEL[timeOfDay],
          season,
          municipality: base.name,
          lat,
          lon,
          tags: { "備考": "デモ用サンプルデータ（実際の出没情報ではありません）", "__sample__": "true" },
          seq: i + 1,
        },
      });
    }
    return features;
  }

  // ---- メインエントリ -------------------------------------------------

  async function fetchBearData(onProgress) {
    const rawFeatures = await fetchAllRawFeatures(onProgress);
    const features = rawFeaturesToStandard(rawFeatures);

    return {
      type: "FeatureCollection",
      features,
      metadata: {
        fetchedAt: new Date().toISOString(),
        rawElementCount: rawFeatures.length,
        source: "埼玉県ツキノワグマ出没マップ（公開用） https://www.pref.saitama.lg.jp/dx-portal/info/kumashutsubotsu.html",
      },
    };
  }

  function fetchSampleData() {
    return {
      type: "FeatureCollection",
      features: generateSampleData(),
      metadata: {
        fetchedAt: new Date().toISOString(),
        sample: true,
      },
    };
  }

  global.SaitamaBearService = {
    YEARS_BACK,
    TIME_OF_DAY_LABEL,
    fetchBearData,
    fetchSampleData,
  };
})(window);
