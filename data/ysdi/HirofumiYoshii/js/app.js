/**
 * app.js
 * アプリケーション全体の初期化・イベントハンドリングを担当する。
 */
(function () {
  "use strict";

  let rawData = { type: "FeatureCollection", features: [] };
  let loadRequestId = 0;

  const el = (id) => document.getElementById(id);

  // ---- 初期化 -------------------------------------------------------

  function initMonthFilter() {
    const container = el("monthFilter");
    for (let m = 1; m <= 12; m++) {
      const label = document.createElement("label");
      label.className = "flex items-center gap-1";
      label.innerHTML = `<input type="checkbox" value="${m}" checked class="month-cb"> ${m}月`;
      container.appendChild(label);
    }
  }

  function initDateDefaults() {
    const today = new Date();
    const fiveYearsAgo = new Date(today);
    fiveYearsAgo.setFullYear(today.getFullYear() - 5);
    el("dateFrom").value = toDateInputValue(fiveYearsAgo);
    el("dateTo").value = toDateInputValue(today);
  }

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active-tab"));
        btn.classList.add("active-tab");
        const tab = btn.dataset.tab;
        el("listTable").classList.toggle("hidden", tab !== "list");
        el("aggTable").classList.toggle("hidden", tab !== "agg");
        el("listActions").classList.toggle("hidden", tab !== "list");
        el("aggActions").classList.toggle("hidden", tab !== "agg");
      });
    });
  }

  function bindEvents() {
    el("reloadBtn").addEventListener("click", loadData);

    document.querySelectorAll(".season-cb, .tod-cb").forEach((cb) =>
      cb.addEventListener("change", applyFilters)
    );
    el("dateFrom").addEventListener("change", applyFilters);
    el("dateTo").addEventListener("change", applyFilters);

    el("monthAll").addEventListener("click", () => setAllMonthChecks(true));
    el("monthNone").addEventListener("click", () => setAllMonthChecks(false));

    el("hourFrom").addEventListener("input", onHourSliderChange);
    el("hourTo").addEventListener("input", onHourSliderChange);

    el("autoLayerToggle").addEventListener("change", (e) => {
      MapController.setLayerMode(e.target.checked);
    });
    el("sampleDataToggle").addEventListener("change", loadData);

    el("resetFilterBtn").addEventListener("click", resetFilters);

    el("downloadGeoJson").addEventListener("click", () => TableController.downloadGeoJson());
    el("downloadCsv").addEventListener("click", () => TableController.downloadCsv());
    el("downloadAggCsv").addEventListener("click", () => TableController.downloadAggCsv());

    document.addEventListener("kuma:layerchange", (e) => {
      el("statLayer").textContent = e.detail.layer === "heatmap" ? "ヒートマップ" : "サークル";
    });
  }

  function setAllMonthChecks(checked) {
    document.querySelectorAll(".month-cb").forEach((cb) => (cb.checked = checked));
    applyFilters();
  }

  function onHourSliderChange() {
    let from = Number(el("hourFrom").value);
    let to = Number(el("hourTo").value);
    el("hourFromLabel").textContent = `${from}時`;
    el("hourToLabel").textContent = `${to}時`;
    applyFilters();
  }

  function resetFilters() {
    initDateDefaults();
    document.querySelectorAll(".season-cb, .tod-cb, .month-cb").forEach((cb) => (cb.checked = true));
    el("hourFrom").value = 0;
    el("hourTo").value = 24;
    el("hourFromLabel").textContent = "0時";
    el("hourToLabel").textContent = "24時";
    applyFilters();
  }

  // ---- データ取得 -----------------------------------------------------

  async function loadData() {
    const requestId = ++loadRequestId;
    const overlay = el("loadingOverlay");
    const loadingText = el("loadingText");
    overlay.classList.remove("hidden");
    overlay.style.display = "flex";
    el("dataStatus").textContent = "";

    const useSample = el("sampleDataToggle").checked;

    try {
      let result;
      if (useSample) {
        loadingText.textContent = "サンプルデータを生成しています...";
        await sleep(200);
        result = SaitamaBearService.fetchSampleData();
      } else {
        result = await SaitamaBearService.fetchBearData((msg) => {
          if (requestId === loadRequestId) loadingText.textContent = msg;
        });
      }

      if (requestId !== loadRequestId) return; // 途中で新しい読み込みが開始された場合は破棄

      rawData = result;
      if (useSample) {
        el("dataStatus").textContent = `サンプルデータ表示中（${rawData.features.length}件・デモ用）`;
      } else {
        el("dataStatus").textContent = `公式データ取得完了（${rawData.features.length}件・過去5年）`;
        if (rawData.features.length === 0) {
          el("dataStatus").textContent += " — 該当データなし。「サンプルデータで動作確認」もお試しください";
        }
      }
      applyFilters();
    } catch (err) {
      if (requestId !== loadRequestId) return;
      console.error(err);
      el("dataStatus").textContent = "データ取得に失敗しました";
      alert(
        "埼玉県公式データの取得に失敗しました。\n" +
          "しばらく待って再試行するか、サイドバーの「サンプルデータで動作確認」をお試しください。\n\n" +
          "詳細: " + err.message
      );
    } finally {
      if (requestId === loadRequestId) overlay.style.display = "none";
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---- フィルター適用 ---------------------------------------------------

  function getCheckedValues(selector) {
    return Array.from(document.querySelectorAll(selector))
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
  }

  function applyFilters() {
    const dateFromVal = el("dateFrom").value;
    const dateToVal = el("dateTo").value;
    const dateFrom = dateFromVal ? new Date(dateFromVal + "T00:00:00") : null;
    const dateTo = dateToVal ? new Date(dateToVal + "T23:59:59") : null;

    const seasons = new Set(getCheckedValues(".season-cb"));
    const months = new Set(getCheckedValues(".month-cb").map(Number));
    const timesOfDay = new Set(getCheckedValues(".tod-cb"));
    const hourFrom = Number(el("hourFrom").value);
    const hourTo = Number(el("hourTo").value);

    const filtered = rawData.features.filter((f) => {
      const p = f.properties;
      const dt = new Date(p.datetime);

      if (dateFrom && dt < dateFrom) return false;
      if (dateTo && dt > dateTo) return false;
      if (!seasons.has(p.season)) return false;
      if (!months.has(dt.getMonth() + 1)) return false;
      if (!timesOfDay.has(p.time_of_day)) return false;

      if (p.has_time) {
        const hour = dt.getHours();
        const inRange =
          hourFrom <= hourTo ? hour >= hourFrom && hour < hourTo : hour >= hourFrom || hour < hourTo;
        if (!inRange) return false;
      }
      return true;
    });

    const filteredCollection = { type: "FeatureCollection", features: filtered };
    MapController.setData(filteredCollection);
    TableController.updateList(filteredCollection);
    TableController.updateAgg(filteredCollection);
    el("statCount").textContent = filtered.length;
  }

  // ---- 起動 -----------------------------------------------------------

  function main() {
    initMonthFilter();
    initDateDefaults();
    initTabs();
    bindEvents();
    TableController.init();
    MapController.init("map", () => {
      loadData();
    });
  }

  document.addEventListener("DOMContentLoaded", main);
})();
