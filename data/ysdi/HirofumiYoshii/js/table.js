/**
 * table.js
 * スプレッドシート（Tabulator）表示、市町村別集計、CSV/GeoJSONダウンロードを担当する。
 * グローバル名前空間 `TableController` として公開する。
 */
(function (global) {
  "use strict";

  let listTable = null;
  let aggTable = null;
  let currentFeatureCollection = { type: "FeatureCollection", features: [] };
  let currentAggRows = [];

  function init() {
    listTable = new Tabulator("#listTable", {
      layout: "fitColumns",
      height: "100%",
      placeholder: "データがありません（期間・条件を変更してください）",
      columns: [
        { title: "ID", field: "id", width: 110, headerFilter: "input" },
        { title: "日時", field: "datetime_label", width: 170, sorter: "string" },
        { title: "市町村", field: "municipality", width: 110, headerFilter: "input" },
        { title: "緯度", field: "lat", width: 100, formatter: (c) => c.getValue().toFixed(5) },
        { title: "経度", field: "lon", width: 100, formatter: (c) => c.getValue().toFixed(5) },
        { title: "時間帯", field: "time_of_day_label", width: 90, headerFilter: "input" },
        { title: "詳細情報", field: "tags_label", minWidth: 200 },
      ],
    });

    aggTable = new Tabulator("#aggTable", {
      layout: "fitColumns",
      height: "100%",
      placeholder: "データがありません",
      columns: [
        { title: "順位", field: "rank", width: 70 },
        { title: "市町村", field: "municipality", widthGrow: 2 },
        { title: "出没件数", field: "count", width: 110, sorter: "number" },
        { title: "割合(%)", field: "ratio", width: 110, formatter: (c) => c.getValue().toFixed(1) + "%" },
      ],
      initialSort: [{ column: "count", dir: "desc" }],
    });
  }

  function toListRow(feature) {
    const p = feature.properties;
    const dt = new Date(p.datetime);
    const datetimeLabel = p.has_time
      ? dt.toLocaleString("ja-JP")
      : dt.toLocaleDateString("ja-JP") + "（時刻不明）";
    return {
      id: p.id,
      datetime_label: datetimeLabel,
      datetime_raw: p.datetime,
      municipality: p.municipality,
      lat: p.lat,
      lon: p.lon,
      time_of_day_label: p.time_of_day_label,
      tags_label: JSON.stringify(p.tags),
      _feature: feature,
    };
  }

  function computeAggregation(features) {
    const counts = new Map();
    for (const f of features) {
      const name = f.properties.municipality || "不明";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const total = features.length || 1;
    const rows = Array.from(counts.entries())
      .map(([municipality, count]) => ({ municipality, count, ratio: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count)
      .map((row, i) => ({ rank: i + 1, ...row }));
    return rows;
  }

  function updateList(featureCollection) {
    currentFeatureCollection = featureCollection;
    listTable.setData(featureCollection.features.map(toListRow));
  }

  function updateAgg(featureCollection) {
    currentAggRows = computeAggregation(featureCollection.features);
    aggTable.setData(currentAggRows);
  }

  function triggerDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadGeoJson() {
    const json = JSON.stringify(currentFeatureCollection, null, 2);
    triggerDownload("saitama_kuma_data.geojson", json, "application/geo+json");
  }

  function csvEscape(value) {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function downloadCsv() {
    const header = ["ID", "日時", "市町村", "緯度", "経度", "時間帯", "詳細情報"];
    const lines = [header.join(",")];
    for (const f of currentFeatureCollection.features) {
      const p = f.properties;
      const dt = new Date(p.datetime);
      const datetimeLabel = p.has_time
        ? dt.toLocaleString("ja-JP")
        : dt.toLocaleDateString("ja-JP") + "（時刻不明）";
      lines.push(
        [
          p.id,
          datetimeLabel,
          p.municipality,
          p.lat.toFixed(6),
          p.lon.toFixed(6),
          p.time_of_day_label,
          JSON.stringify(p.tags),
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    const csv = "﻿" + lines.join("\r\n");
    triggerDownload("saitama_kuma_data.csv", csv, "text/csv;charset=utf-8");
  }

  function downloadAggCsv() {
    const header = ["順位", "市町村", "出没件数", "割合(%)"];
    const lines = [header.join(",")];
    for (const row of currentAggRows) {
      lines.push(
        [row.rank, row.municipality, row.count, row.ratio.toFixed(1)].map(csvEscape).join(",")
      );
    }
    const csv = "﻿" + lines.join("\r\n");
    triggerDownload("saitama_kuma_municipality_summary.csv", csv, "text/csv;charset=utf-8");
  }

  global.TableController = {
    init,
    updateList,
    updateAgg,
    downloadGeoJson,
    downloadCsv,
    downloadAggCsv,
  };
})(window);
