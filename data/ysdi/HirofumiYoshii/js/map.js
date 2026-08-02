/**
 * map.js
 * MapLibre GL JS の初期化、レイヤー描画（ヒートマップ/サークル切替）、
 * ポップアップ表示、フィルター適用後データの反映を担当する。
 * グローバル名前空間 `MapController` として公開する。
 */
(function (global) {
  "use strict";

  const SAITAMA_CENTER = [139.45, 36.05];
  const SAITAMA_BOUNDS = [
    [138.7, 35.7],
    [139.95, 36.35],
  ];
  const HEATMAP_ZOOM_THRESHOLD = 11;
  const SOURCE_ID = "kuma-data";

  let map = null;
  let autoLayerMode = true;
  let currentData = { type: "FeatureCollection", features: [] };
  let popup = null;

  const TIME_OF_DAY_LABEL = {
    morning: "朝",
    daytime: "昼",
    evening: "夕方",
    night: "夜間",
    unknown: "不明",
  };

  function gsiStyle() {
    return {
      version: 8,
      sources: {
        gsi: {
          type: "raster",
          tiles: ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"],
          tileSize: 256,
          minzoom: 2,
          maxzoom: 18,
          attribution:
            '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
        },
      },
      layers: [{ id: "gsi-layer", type: "raster", source: "gsi" }],
    };
  }

  function init(containerId, onReady) {
    map = new maplibregl.Map({
      container: containerId,
      style: gsiStyle(),
      center: SAITAMA_CENTER,
      zoom: 9,
      minZoom: 6,
      maxZoom: 18,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      map.fitBounds(SAITAMA_BOUNDS, { padding: 24, duration: 0 });
      addLayers();
      map.on("zoom", updateLayerVisibility);
      onReady?.();
    });

    return map;
  }

  function addLayers() {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: currentData,
    });

    map.addLayer({
      id: "kuma-heatmap",
      type: "heatmap",
      source: SOURCE_ID,
      maxzoom: HEATMAP_ZOOM_THRESHOLD + 1,
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 11, 1.4],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 6, 10, 11, 26],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.85, 11, 0],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(0,0,0,0)",
          0.2, "#fef3c7",
          0.4, "#fcd34d",
          0.6, "#f59e0b",
          0.8, "#d97706",
          1, "#7c2d12",
        ],
      },
    });

    map.addLayer({
      id: "kuma-circle",
      type: "circle",
      source: SOURCE_ID,
      minzoom: 0,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 14, 9],
        "circle-color": [
          "match",
          ["get", "time_of_day"],
          "morning", "#facc15",
          "daytime", "#f59e0b",
          "evening", "#ea580c",
          "night", "#7c3aed",
          "#94a3b8",
        ],
        "circle-stroke-width": 1.2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    map.on("mouseenter", "kuma-circle", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "kuma-circle", () => (map.getCanvas().style.cursor = ""));
    map.on("click", "kuma-circle", onFeatureClick);

    updateLayerVisibility();
  }

  function onFeatureClick(e) {
    const feature = e.features?.[0];
    if (!feature) return;
    const p = feature.properties;
    const dt = new Date(p.datetime);
    const dtLabel = p.has_time === "true" || p.has_time === true
      ? dt.toLocaleString("ja-JP")
      : dt.toLocaleDateString("ja-JP") + "（時刻不明）";

    let tags = p.tags;
    if (typeof tags === "string") {
      try { tags = JSON.parse(tags); } catch (_) { tags = {}; }
    }

    const html = `
      <div class="popup-title">🐻 熊出没情報</div>
      <div class="popup-row"><span class="label">日時</span><span>${escapeHtml(dtLabel)}</span></div>
      <div class="popup-row"><span class="label">市町村</span><span>${escapeHtml(p.municipality)}</span></div>
      <div class="popup-row"><span class="label">時間帯</span><span>${escapeHtml(p.time_of_day_label)}</span></div>
      <div class="popup-row"><span class="label">座標</span><span>${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}</span></div>
      <div class="popup-tags">${escapeHtml(JSON.stringify(tags, null, 1))}</div>
    `;

    popup?.remove();
    popup = new maplibregl.Popup({ maxWidth: "280px" })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(map);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function updateLayerVisibility() {
    if (!map.getLayer("kuma-heatmap") || !map.getLayer("kuma-circle")) return;
    const zoom = map.getZoom();
    let activeLayer;
    if (autoLayerMode) {
      const showHeatmap = zoom < HEATMAP_ZOOM_THRESHOLD;
      map.setLayoutProperty("kuma-heatmap", "visibility", showHeatmap ? "visible" : "none");
      map.setLayoutProperty("kuma-circle", "visibility", showHeatmap ? "none" : "visible");
      activeLayer = showHeatmap ? "heatmap" : "circle";
    } else {
      map.setLayoutProperty("kuma-heatmap", "visibility", "none");
      map.setLayoutProperty("kuma-circle", "visibility", "visible");
      activeLayer = "circle";
    }
    document.dispatchEvent(new CustomEvent("kuma:layerchange", { detail: { layer: activeLayer } }));
  }

  function setLayerMode(auto) {
    autoLayerMode = auto;
    updateLayerVisibility();
  }

  function setData(featureCollection) {
    currentData = featureCollection;
    const src = map?.getSource(SOURCE_ID);
    if (src) src.setData(currentData);
  }

  function getMap() {
    return map;
  }

  global.MapController = {
    init,
    setData,
    setLayerMode,
    getMap,
    TIME_OF_DAY_LABEL,
  };
})(window);
