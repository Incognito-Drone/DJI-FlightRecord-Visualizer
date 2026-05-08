
const dom = {
  form: document.getElementById("analyzeForm"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  fileInput: document.getElementById("fileInput"),
  filePickerButton: document.getElementById("filePickerButton"),
  filePickerLabel: document.getElementById("filePickerLabel"),
  analyzeButton: document.getElementById("analyzeButton"),
  sampleButton: document.getElementById("sampleButton"),
  playButton: document.getElementById("playButton"),
  pauseButton: document.getElementById("pauseButton"),
  resetButton: document.getElementById("resetButton"),
  speedSelect: document.getElementById("speedSelect"),
  timelineRange: document.getElementById("timelineRange"),
  timelineLabel: document.getElementById("timelineLabel"),
  messageBar: document.getElementById("messageBar"),
  controlPanel: document.querySelector(".control-panel"),
  viewerPanel: document.getElementById("viewerPanel"),
  viewerControls: document.getElementById("viewerControls"),
  viewerTitle: document.getElementById("viewerTitle"),
  summaryAircraft: document.getElementById("summaryAircraft"),
  summarySerial: document.getElementById("summarySerial"),
  summaryDuration: document.getElementById("summaryDuration"),
  summaryDistance: document.getElementById("summaryDistance"),
  summaryHeight: document.getElementById("summaryHeight"),
  summarySpeed: document.getElementById("summarySpeed"),
  liveAltitudeNow: document.getElementById("liveAltitudeNow"),
  liveHorizontalNow: document.getElementById("liveHorizontalNow"),
  liveVerticalNow: document.getElementById("liveVerticalNow"),
  fallbackMap: document.getElementById("fallbackMap"),
  leafletMap: document.getElementById("leafletMap"),
  sceneCanvas: document.getElementById("sceneCanvas"),
  sceneRenderHost: document.getElementById("sceneRenderHost"),
  sceneOverlay: document.getElementById("sceneOverlay"),
  dashboardView: document.getElementById("dashboardView"),
  summaryPanel: document.getElementById("summaryPanel"),
  livePanel: document.getElementById("livePanel"),
  tabButtons: Array.from(document.querySelectorAll("[data-tab-target]")),
  tabPanels: Array.from(document.querySelectorAll("[data-tab-panel]")),
};

const state = {
  flight: null,
  points: [],
  currentTime: 0,
  currentFrame: null,
  currentSegmentIndex: 0,
  playing: false,
  playbackRate: 1,
  lastAnimationTs: 0,
  activeTab: "dashboard",
  mapMode: "fallback",
  leafletAttempted: false,
  map: null,
  streetLayer: null,
  satelliteLayer: null,
  mapLayerMode: "street",
  mapLayerButton: null,
  fullPathLayer: null,
  flownPathLayer: null,
  markerLayer: null,
  scene: null,
  scenePoints: [],
  currentSceneFrame: null,
  three: {
    runtime: null,
    bundlePromise: null,
    renderer: null,
    scene3d: null,
    camera: null,
    worldRoot: null,
    droneRoot: null,
    placeholderRoot: null,
    droneModelPromise: null,
    droneModelBaseScale: 1,
    fullPathLine: null,
    flownPathLine: null,
    altitudeLine: null,
    grid: null,
    statusEl: null,
    geometryDirty: true,
    failed: false,
    error: "",
    modelLoading: false,
    modelError: "",
  },
  interaction: {
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  },
};

const STREET_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const STREET_TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";
const SATELLITE_TILE_URL = "https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_TILE_ATTRIBUTION = "Tiles &copy; Esri";
const THREE_VERSION = "0.161.0";
const DRONE_MODEL_URL = "/static/models/drone.glb";
const DASHBOARD_TONES = {
  cool: {
    stroke: "#2f97ff",
    meterClass: "cool",
    stops: [
      { offset: "0%", color: "#9ed7ff", opacity: 0.62 },
      { offset: "72%", color: "#51b0ff", opacity: 0.22 },
      { offset: "100%", color: "#51b0ff", opacity: 0.04 },
    ],
  },
  warm: {
    stroke: "#ff9f56",
    meterClass: "warm",
    stops: [
      { offset: "0%", color: "#ffd36c", opacity: 0.56 },
      { offset: "72%", color: "#ff9f56", opacity: 0.20 },
      { offset: "100%", color: "#ff9f56", opacity: 0.04 },
    ],
  },
  ice: {
    stroke: "#7e7aff",
    meterClass: "ice",
    stops: [
      { offset: "0%", color: "#b8b3ff", opacity: 0.54 },
      { offset: "72%", color: "#7e7aff", opacity: 0.18 },
      { offset: "100%", color: "#7e7aff", opacity: 0.04 },
    ],
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setMessage(message = "", tone = "info") {
  if (!message) {
    dom.messageBar.textContent = "";
    dom.messageBar.className = "message-bar hidden";
    return;
  }

  dom.messageBar.textContent = message;
  dom.messageBar.className = `message-bar ${tone}`;
}

function getViewerTitle(tabName) {
  if (tabName === "dashboard") return "FLIGHT DASHBOARD";
  if (tabName === "map") return "MAP";
  return "3D MOTION";
}

function applyTabContext(tabName) {
  const isDashboard = tabName === "dashboard";
  dom.controlPanel.classList.toggle("dashboard-mode", isDashboard);
  if (dom.viewerPanel) dom.viewerPanel.classList.toggle("dashboard-mode", isDashboard);
  if (dom.summaryPanel) dom.summaryPanel.hidden = isDashboard;
  if (dom.livePanel) dom.livePanel.hidden = isDashboard;
  if (dom.viewerControls) dom.viewerControls.hidden = isDashboard;
  dom.viewerTitle.textContent = getViewerTitle(tabName);
}

function switchTab(tabName) {
  state.activeTab = tabName;
  applyTabContext(tabName);

  dom.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === tabName);
  });

  dom.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tabPanel === tabName);
  });

  if (tabName === "map") {
    if (state.map) {
      setTimeout(() => {
        state.map.invalidateSize();
        updateLeafletPlayback();
      }, 40);
    } else {
      syncLeafletMap();
    }
  } else if (tabName === "scene") {
    if (!state.three.droneRoot && state.three.modelError) {
      state.three.modelError = "";
      state.three.droneModelPromise = null;
    }

    window.requestAnimationFrame(() => {
      syncThreeSceneLayout();
      draw3DScene();
      window.setTimeout(() => {
        if (state.activeTab !== "scene") return;
        syncThreeSceneLayout();
        draw3DScene();
      }, 60);
    });
  }

  renderAll();
}

function formatMeters(value) {
  return `${Number(value || 0).toFixed(1)}m`;
}

function formatSpeed(value) {
  return `${Number(value || 0).toFixed(2)}m/s`;
}

function formatSignedSpeed(value) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? "+" : ""}${numeric.toFixed(2)}m/s`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total - minutes * 60;
  return minutes > 0 ? `${minutes}m ${remainder.toFixed(1)}s` : `${remainder.toFixed(1)}s`;
}

function formatCoordinate(value) {
  return Number(value || 0).toFixed(6);
}

function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  const scaledWidth = Math.floor(width * dpr);
  const scaledHeight = Math.floor(height * dpr);

  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function getElementSize(element) {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

function niceStep(value) {
  if (!Number.isFinite(value) || value <= 0) return 10;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / power;
  if (normalized <= 1) return power;
  if (normalized <= 2) return 2 * power;
  if (normalized <= 5) return 5 * power;
  return 10 * power;
}

function findSegment(points, time) {
  if (!points.length) return null;
  if (time <= points[0].time_s) return { index: 0, alpha: 0, a: points[0], b: points[0] };

  const lastIndex = points.length - 1;
  if (time >= points[lastIndex].time_s) {
    return { index: lastIndex, alpha: 0, a: points[lastIndex], b: points[lastIndex] };
  }

  let low = 0;
  let high = lastIndex;
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].time_s <= time) low = mid;
    else high = mid;
  }

  const a = points[low];
  const b = points[high];
  const span = Math.max(1e-6, b.time_s - a.time_s);
  return { index: low, alpha: (time - a.time_s) / span, a, b };
}

function interpolateFrame(points, time) {
  const segment = findSegment(points, time);
  if (!segment) return null;

  const { index, alpha, a, b } = segment;
  if (a === b) return { ...a, time_s: time, _segmentIndex: index };

  return {
    _segmentIndex: index,
    time_s: time,
    latitude: lerp(a.latitude, b.latitude, alpha),
    longitude: lerp(a.longitude, b.longitude, alpha),
    x_m: lerp(a.x_m, b.x_m, alpha),
    y_m: lerp(a.y_m, b.y_m, alpha),
    z_m: lerp(a.z_m, b.z_m, alpha),
    height_m: lerp(a.height_m, b.height_m, alpha),
    altitude_m: lerp(a.altitude_m, b.altitude_m, alpha),
    pitch_deg: lerp(a.pitch_deg, b.pitch_deg, alpha),
    roll_deg: lerp(a.roll_deg, b.roll_deg, alpha),
    yaw_deg: lerpAngle(a.yaw_deg, b.yaw_deg, alpha),
    bearing_deg: lerpAngle(a.bearing_deg, b.bearing_deg, alpha),
    derived_horizontal_speed_mps: lerp(a.derived_horizontal_speed_mps, b.derived_horizontal_speed_mps, alpha),
    derived_vertical_speed_mps: lerp(a.derived_vertical_speed_mps, b.derived_vertical_speed_mps, alpha),
    raw_horizontal_speed_mps: lerp(a.raw_horizontal_speed_mps, b.raw_horizontal_speed_mps, alpha),
    raw_vertical_speed_axis_mps: lerp(a.raw_vertical_speed_axis_mps, b.raw_vertical_speed_axis_mps, alpha),
    timestamp: alpha < 0.5 ? a.timestamp : b.timestamp,
    tip: alpha < 0.5 ? a.tip : b.tip,
    warning: alpha < 0.5 ? a.warning : b.warning,
    is_on_ground: alpha < 0.5 ? a.is_on_ground : b.is_on_ground,
  };
}

function updateSummary(analysis) {
  dom.summaryAircraft.textContent = analysis.aircraft_name || "-";
  dom.summarySerial.textContent = analysis.serial_number || "-";
  dom.summaryDuration.textContent = formatDuration(analysis.duration_s);
  dom.summaryDistance.textContent = formatMeters(analysis.total_distance_2d_m);
  dom.summaryHeight.textContent = formatMeters(analysis.max_height_m);
  dom.summarySpeed.textContent = formatSpeed(analysis.max_horizontal_speed_mps);
}

function updateLiveMetrics(frame) {
  if (!frame) {
    dom.liveAltitudeNow.textContent = "-";
    dom.liveHorizontalNow.textContent = "-";
    dom.liveVerticalNow.textContent = "-";
    return;
  }

  dom.liveAltitudeNow.textContent = formatMeters(frame.height_m);
  dom.liveHorizontalNow.textContent = formatSpeed(frame.derived_horizontal_speed_mps);
  dom.liveVerticalNow.textContent = formatSignedSpeed(frame.derived_vertical_speed_mps);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatMetersBrief(value) {
  const numeric = Number(value || 0);
  const absolute = Math.abs(numeric);
  if (absolute >= 1000) {
    return `${(numeric / 1000).toFixed(absolute >= 10000 ? 1 : 2)}km`;
  }
  return `${numeric.toFixed(1)}m`;
}

function formatPercent(value) {
  return `${Math.round(clamp(value || 0, 0, 1) * 100)}%`;
}

function setTimelineProgress(value, maxValue) {
  if (!dom.timelineRange) return;
  const safeMax = Math.max(Number(maxValue || 0), 0);
  const safeValue = Math.max(Number(value || 0), 0);
  const ratio = safeMax > 0 ? clamp(safeValue / safeMax, 0, 1) : 0;
  dom.timelineRange.style.setProperty("--range-progress", `${(ratio * 100).toFixed(2)}%`);
}

let dashboardSvgId = 0;

function nextDashboardSvgId(prefix) {
  dashboardSvgId += 1;
  return `${prefix}-${dashboardSvgId}`;
}

function buildDashboardModel() {
  if (!state.flight || !state.points.length) return null;

  const points = state.points;
  const duration = Number(state.flight.duration_s || points[points.length - 1]?.time_s || 0);
  const currentFrame = state.currentFrame || points[0] || null;
  const altitudeSeries = points.map((point) => Number(point.height_m ?? point.z_m ?? 0));
  const speedSeries = points.map((point) => Number(point.derived_horizontal_speed_mps || point.raw_horizontal_speed_mps || 0));
  const verticalSeries = points.map((point) => Number(point.derived_vertical_speed_mps || point.raw_vertical_speed_axis_mps || 0));
  const rangeSeries = points.map((point) => Math.hypot(Number(point.x_m || 0), Number(point.y_m || 0)));
  const airborneCount = points.filter((point) => !point.is_on_ground).length;
  const maxRange = Math.max(...rangeSeries, 0);
  const currentRange = currentFrame ? Math.hypot(Number(currentFrame.x_m || 0), Number(currentFrame.y_m || 0)) : 0;
  const currentRatio = duration > 0 ? clamp(state.currentTime / duration, 0, 1) : 0;
  const totalDistance2D = Number(state.flight.total_distance_2d_m || 0);
  const totalDistance3D = Number(state.flight.total_distance_3d_m || 0);

  return {
    aircraftName: state.flight.aircraft_name || "Unknown",
    pointCount: Number(state.flight.point_count || points.length || 0),
    duration,
    totalDistance2D,
    totalDistance3D,
    maxHeight: Number(state.flight.max_height_m || 0),
    minHeight: Number(state.flight.min_height_m || 0),
    maxSpeed: Number(state.flight.max_horizontal_speed_mps || 0),
    maxClimb: Number(state.flight.max_climb_speed_mps || 0),
    maxDescent: Number(state.flight.max_descent_speed_mps || 0),
    altitudeSeries,
    speedSeries,
    verticalSeries,
    rangeSeries,
    currentRatio,
    currentAltitude: currentFrame ? Number(currentFrame.height_m ?? currentFrame.z_m ?? 0) : 0,
    currentSpeed: currentFrame ? Number(currentFrame.derived_horizontal_speed_mps || currentFrame.raw_horizontal_speed_mps || 0) : 0,
    currentVertical: currentFrame ? Number(currentFrame.derived_vertical_speed_mps || currentFrame.raw_vertical_speed_axis_mps || 0) : 0,
    currentRange,
    maxRange,
    airborneRatio: airborneCount / Math.max(points.length, 1),
    routeEfficiency: totalDistance3D > 0 ? totalDistance2D / totalDistance3D : 0,
  };
}

function createChartGeometry(series, width, height, options = {}) {
  const values = (series && series.length ? series : [0, 0]).map((value) => Number(value || 0));
  const left = options.left ?? 18;
  const right = options.right ?? 14;
  const top = options.top ?? 18;
  const bottom = options.bottom ?? 22;
  const includeZero = options.includeZero !== false;

  let minValue = Number.isFinite(options.minValue) ? options.minValue : Math.min(...values);
  let maxValue = Number.isFinite(options.maxValue) ? options.maxValue : Math.max(...values);

  if (includeZero) {
    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);
  }

  if (Math.abs(maxValue - minValue) < 1e-6) {
    const pad = Math.max(Math.abs(maxValue) * 0.25, 1);
    minValue -= pad;
    maxValue += pad;
  }

  const innerWidth = Math.max(1, width - left - right);
  const innerHeight = Math.max(1, height - top - bottom);
  const baseY = height - bottom;
  const span = Math.max(values.length - 1, 1);
  const valueSpan = maxValue - minValue;

  const points = values.map((value, index) => {
    const x = left + (index / span) * innerWidth;
    const y = baseY - ((value - minValue) / valueSpan) * innerHeight;
    return { x, y };
  });

  return { values, points, width, height, left, right, top, bottom, innerWidth, innerHeight, baseY, minValue, maxValue };
}

function buildSvgPath(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function buildSvgAreaPath(points, baseY) {
  if (!points.length) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${buildSvgPath(points)} L${last.x.toFixed(2)} ${baseY.toFixed(2)} L${first.x.toFixed(2)} ${baseY.toFixed(2)} Z`;
}

function buildGradientStops(stops) {
  return stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}" stop-opacity="${stop.opacity}" />`).join("");
}

function buildGridMarkup(geometry, rows = 4, columns = 5) {
  let markup = "";
  for (let index = 0; index <= rows; index += 1) {
    const y = geometry.top + (geometry.innerHeight / rows) * index;
    markup += `<line class="dashboard-grid-line" x1="${geometry.left}" y1="${y.toFixed(2)}" x2="${(geometry.width - geometry.right).toFixed(2)}" y2="${y.toFixed(2)}" />`;
  }
  for (let index = 0; index <= columns; index += 1) {
    const x = geometry.left + (geometry.innerWidth / columns) * index;
    markup += `<line class="dashboard-grid-line" x1="${x.toFixed(2)}" y1="${geometry.top}" x2="${x.toFixed(2)}" y2="${(geometry.height - geometry.bottom).toFixed(2)}" />`;
  }
  return markup;
}

function buildZeroLineMarkup(geometry) {
  if (!(geometry.minValue < 0 && geometry.maxValue > 0)) return "";
  const y = geometry.baseY - ((0 - geometry.minValue) / (geometry.maxValue - geometry.minValue)) * geometry.innerHeight;
  return `<line class="dashboard-zero-line" x1="${geometry.left}" y1="${y.toFixed(2)}" x2="${(geometry.width - geometry.right).toFixed(2)}" y2="${y.toFixed(2)}" />`;
}

function pickPointAtRatio(points, ratio) {
  if (!points.length) return null;
  const index = Math.max(0, Math.min(points.length - 1, Math.round(clamp(ratio || 0, 0, 1) * (points.length - 1))));
  return points[index];
}

function buildMarkerMarkup(geometry, points, ratio, color) {
  if (!points.length) return "";
  const point = pickPointAtRatio(points, ratio);
  if (!point) return "";
  return `<line class="dashboard-marker-line" x1="${point.x.toFixed(2)}" y1="${geometry.top}" x2="${point.x.toFixed(2)}" y2="${(geometry.height - geometry.bottom).toFixed(2)}" />` + `<circle class="dashboard-marker-dot" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.5" fill="${color}" />`;
}

function buildSparklineSvg(series, toneKey, ratio) {
  const tone = DASHBOARD_TONES[toneKey] || DASHBOARD_TONES.cool;
  const geometry = createChartGeometry(series, 220, 66, { left: 4, right: 4, top: 8, bottom: 8 });
  const gradientId = nextDashboardSvgId(`spark-${toneKey}`);
  return `
    <svg viewBox="0 0 220 66" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          ${buildGradientStops(tone.stops)}
        </linearGradient>
      </defs>
      <path d="${buildSvgAreaPath(geometry.points, 62)}" fill="url(#${gradientId})"></path>
      <path d="${buildSvgPath(geometry.points)}" fill="none" stroke="${tone.stroke}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"></path>
      ${buildMarkerMarkup({ ...geometry, top: 8, bottom: 4, height: 66 }, geometry.points, ratio, tone.stroke)}
    </svg>`;
}

function buildAreaChartSvg(series, toneKey, markerRatio, options = {}) {
  const tone = DASHBOARD_TONES[toneKey] || DASHBOARD_TONES.cool;
  const width = options.width ?? 620;
  const height = options.height ?? 248;
  const geometry = createChartGeometry(series, width, height, options);
  const gradientId = nextDashboardSvgId(`area-${toneKey}`);
  return `
    <svg class="dashboard-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          ${buildGradientStops(tone.stops)}
        </linearGradient>
      </defs>
      ${buildGridMarkup(geometry)}
      ${buildZeroLineMarkup(geometry)}
      <path d="${buildSvgAreaPath(geometry.points, geometry.baseY)}" fill="url(#${gradientId})"></path>
      <path d="${buildSvgPath(geometry.points)}" fill="none" stroke="${tone.stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
      ${buildMarkerMarkup(geometry, geometry.points, markerRatio, tone.stroke)}
    </svg>`;
}

function buildDualChartSvg(primarySeries, secondarySeries, markerRatio) {
  const width = 420;
  const height = 196;
  const maxPrimary = Math.max(...primarySeries, 0);
  const maxSecondary = Math.max(...secondarySeries, 0);
  const minSecondary = Math.min(...secondarySeries, 0);
  const geometry = createChartGeometry(primarySeries, width, height, { minValue: Math.min(minSecondary, 0), maxValue: Math.max(maxPrimary, maxSecondary, 1) });
  const verticalGeometry = createChartGeometry(secondarySeries, width, height, { minValue: geometry.minValue, maxValue: geometry.maxValue });
  const gradientId = nextDashboardSvgId('speed-cool');
  return `
    <svg class="dashboard-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          ${buildGradientStops(DASHBOARD_TONES.cool.stops)}
        </linearGradient>
      </defs>
      ${buildGridMarkup(geometry, 4, 4)}
      ${buildZeroLineMarkup(geometry)}
      <path d="${buildSvgAreaPath(geometry.points, geometry.baseY)}" fill="url(#${gradientId})"></path>
      <path d="${buildSvgPath(geometry.points)}" fill="none" stroke="${DASHBOARD_TONES.cool.stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="${buildSvgPath(verticalGeometry.points)}" fill="none" stroke="${DASHBOARD_TONES.warm.stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
      ${buildMarkerMarkup(geometry, geometry.points, markerRatio, DASHBOARD_TONES.cool.stroke)}
      ${buildMarkerMarkup(verticalGeometry, verticalGeometry.points, markerRatio, DASHBOARD_TONES.warm.stroke)}
    </svg>`;
}

function buildDashboardMetricCard({ label, value, note, series, meterRatio, markerRatio = 0, toneKey }) {
  const tone = DASHBOARD_TONES[toneKey] || DASHBOARD_TONES.cool;
  const safeMeterRatio = clamp(meterRatio || 0, 0, 1);
  const safeMarkerRatio = clamp(markerRatio || 0, 0, 1);
  return `
    <article class="dashboard-stat-card">
      <span class="dashboard-stat-label">${escapeHtml(label)}</span>
      <strong class="dashboard-stat-value">${escapeHtml(value)}</strong>
      <span class="dashboard-stat-note">${escapeHtml(note)}</span>
      <div class="dashboard-sparkline">${buildSparklineSvg(series, toneKey, state.activeTab === "dashboard" ? safeMarkerRatio : 0)}</div>
      <div class="dashboard-meter"><span class="dashboard-meter-fill ${tone.meterClass}" style="width:${(safeMeterRatio * 100).toFixed(1)}%"></span></div>
    </article>`;
}

function buildDashboardEmpty() {
  const zeroSeries = [0, 0, 0, 0, 0, 0];
  return `
    <section class="dashboard-hero dashboard-empty">
      <article class="dashboard-intro">
        <div>
          <span class="dashboard-kicker">Dashboard</span>
          <h2 class="dashboard-headline">Flight analytics at a glance</h2>
          <p class="dashboard-copy">Load a sample or analyze a FlightRecord to populate altitude, speed, range, and playback-driven flight metrics.</p>
        </div>
        <div class="dashboard-chip-row">
          <span class="dashboard-chip">No telemetry</span>
          <span class="dashboard-chip">Charts primed</span>
          <span class="dashboard-chip">Default landing view</span>
        </div>
      </article>
    </section>
    <section class="dashboard-stat-grid">
      ${buildDashboardMetricCard({ label: 'Range From Home', value: '-', note: 'Telemetry not loaded', series: zeroSeries, meterRatio: 0, markerRatio: 0, toneKey: 'ice' })}
      ${buildDashboardMetricCard({ label: 'Altitude Envelope', value: '-', note: 'Telemetry not loaded', series: zeroSeries, meterRatio: 0, markerRatio: 0, toneKey: 'cool' })}
      ${buildDashboardMetricCard({ label: 'Speed Envelope', value: '-', note: 'Telemetry not loaded', series: zeroSeries, meterRatio: 0, markerRatio: 0, toneKey: 'warm' })}
      ${buildDashboardMetricCard({ label: 'Vertical Rate', value: '-', note: 'Telemetry not loaded', series: zeroSeries, meterRatio: 0, markerRatio: 0, toneKey: 'ice' })}
    </section>
    <section class="dashboard-main-grid">
      <article class="dashboard-chart-card dashboard-chart-card-major">
        <div class="dashboard-chart-top">
          <div>
            <span class="dashboard-chart-label">Altitude Profile</span>
            <h3 class="dashboard-chart-title">Altitude trace</h3>
            <p class="dashboard-chart-meta">The complete altitude envelope appears here once telemetry is loaded.</p>
          </div>
          <div class="dashboard-chart-value">-<small>No signal</small></div>
        </div>
        ${buildAreaChartSvg(zeroSeries, 'cool', 0, { minValue: 0, maxValue: 1, height: 248 })}
      </article>
      <div class="dashboard-side-stack">
        <article class="dashboard-chart-card">
          <div class="dashboard-chart-top">
            <div>
              <span class="dashboard-chart-label">Speed Signature</span>
              <h3 class="dashboard-chart-title">Speed profile</h3>
              <p class="dashboard-chart-meta">Horizontal and vertical velocity are layered on the same time axis.</p>
            </div>
            <div class="dashboard-chart-value">-<small>No signal</small></div>
          </div>
          ${buildDualChartSvg(zeroSeries, zeroSeries, 0)}
        </article>
      </div>
    </section>`;
}

function buildDashboardPopulated(model) {
  const rangeRatio = model.maxRange > 0 ? model.currentRange / model.maxRange : 0;
  const altitudeRatio = model.maxHeight > 0 ? model.currentAltitude / model.maxHeight : 0;
  const speedRatio = model.maxSpeed > 0 ? model.currentSpeed / model.maxSpeed : 0;
  const verticalPeak = Math.max(model.maxClimb, model.maxDescent, Math.abs(model.currentVertical), 0.001);
  const verticalRatio = Math.abs(model.currentVertical) / verticalPeak;

  return `
    <section class="dashboard-hero">
      <article class="dashboard-intro">
        <div>
          <span class="dashboard-kicker">Mission Overview</span>
          <h2 class="dashboard-headline">${escapeHtml(model.aircraftName)}</h2>
        </div>
        <div class="dashboard-chip-row">
          <span class="dashboard-chip">${escapeHtml(formatDuration(model.duration))}</span>
          <span class="dashboard-chip">${escapeHtml(formatMetersBrief(model.totalDistance2D))} route</span>
          <span class="dashboard-chip">${escapeHtml(String(model.pointCount))} samples</span>
          <span class="dashboard-chip">${escapeHtml(formatSpeed(model.maxSpeed))} peak</span>
        </div>
      </article>
    </section>
    <section class="dashboard-stat-grid">
      ${buildDashboardMetricCard({ label: 'Range From Home', value: formatMetersBrief(model.currentRange), note: `Peak ${formatMetersBrief(model.maxRange)}`, series: model.rangeSeries, meterRatio: rangeRatio, markerRatio: model.currentRatio, toneKey: 'ice' })}
      ${buildDashboardMetricCard({ label: 'Altitude Envelope', value: formatMeters(model.currentAltitude), note: `Peak ${formatMeters(model.maxHeight)}`, series: model.altitudeSeries, meterRatio: altitudeRatio, markerRatio: model.currentRatio, toneKey: 'cool' })}
      ${buildDashboardMetricCard({ label: 'Speed Envelope', value: formatSpeed(model.currentSpeed), note: `Peak ${formatSpeed(model.maxSpeed)}`, series: model.speedSeries, meterRatio: speedRatio, markerRatio: model.currentRatio, toneKey: 'warm' })}
      ${buildDashboardMetricCard({ label: 'Vertical Rate', value: formatSignedSpeed(model.currentVertical), note: `Climb ${formatSpeed(model.maxClimb)} / Descent ${formatSpeed(model.maxDescent)}`, series: model.verticalSeries, meterRatio: verticalRatio, markerRatio: model.currentRatio, toneKey: 'ice' })}
    </section>
    <section class="dashboard-main-grid">
      <article class="dashboard-chart-card dashboard-chart-card-major">
        <div class="dashboard-chart-top">
          <div>
            <span class="dashboard-chart-label">Altitude Profile</span>
            <h3 class="dashboard-chart-title">Altitude trace</h3>
            <p class="dashboard-chart-meta">The current playback index is projected onto the full altitude envelope.</p>
          </div>
          <div class="dashboard-chart-value">${escapeHtml(formatMeters(model.currentAltitude))}<small>Peak ${escapeHtml(formatMeters(model.maxHeight))}</small></div>
        </div>
        ${buildAreaChartSvg(model.altitudeSeries, 'cool', model.currentRatio, { minValue: Math.min(0, model.minHeight), maxValue: Math.max(model.maxHeight, model.currentAltitude, 1), height: 248 })}
      </article>
      <div class="dashboard-side-stack">
        <article class="dashboard-chart-card">
          <div class="dashboard-chart-top">
            <div>
              <span class="dashboard-chart-label">Speed Signature</span>
              <h3 class="dashboard-chart-title">Speed profile</h3>
              <p class="dashboard-chart-meta">Horizontal and vertical speed are compared on a shared time axis.</p>
            </div>
            <div class="dashboard-chart-value">${escapeHtml(formatSpeed(model.currentSpeed))}<small>Vertical ${escapeHtml(formatSignedSpeed(model.currentVertical))}</small></div>
          </div>
          ${buildDualChartSvg(model.speedSeries, model.verticalSeries, model.currentRatio)}
          <div class="dashboard-legend">
            <span class="dashboard-legend-item"><span class="dashboard-legend-swatch cool"></span>Horizontal speed</span>
            <span class="dashboard-legend-item"><span class="dashboard-legend-swatch warm"></span>Vertical speed</span>
          </div>
        </article>
      </div>
    </section>`;
}

function drawDashboard() {
  if (!dom.dashboardView) return;
  if (state.activeTab !== "dashboard" && dom.dashboardView.dataset.ready === "1") return;

  dashboardSvgId = 0;
  const model = buildDashboardModel();
  dom.dashboardView.innerHTML = model ? buildDashboardPopulated(model) : buildDashboardEmpty();
  dom.dashboardView.dataset.ready = "1";
}

function computeBounds(points, keyX, keyY) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, point[keyX]);
    maxX = Math.max(maxX, point[keyX]);
    minY = Math.min(minY, point[keyY]);
    maxY = Math.max(maxY, point[keyY]);
  });

  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const padX = spanX * 0.12 + 8;
  const padY = spanY * 0.12 + 8;

  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
    spanX: spanX + padX * 2,
    spanY: spanY + padY * 2,
  };
}

function mapPointToCanvas(point, bounds, width, height, padding) {
  const drawWidth = width - padding * 2;
  const drawHeight = height - padding * 2;
  const x = padding + ((point.x_m - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 1)) * drawWidth;
  const y = height - padding - ((point.y_m - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 1)) * drawHeight;
  return { x, y };
}

function drawFallbackMap() {
  const { ctx, width, height } = resizeCanvas(dom.fallbackMap);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f4faff";
  ctx.fillRect(0, 0, width, height);

  if (!state.points.length) {
    ctx.fillStyle = "#7a91aa";
    ctx.font = "600 16px Segoe UI Variable";
    ctx.fillText("Load telemetry to render the map.", 24, 34);
    return;
  }

  const bounds = computeBounds(state.points, "x_m", "y_m");
  const padding = 28;
  const gridStep = niceStep(Math.max(bounds.spanX, bounds.spanY) / 6);

  ctx.strokeStyle = "rgba(120, 162, 204, 0.24)";
  ctx.lineWidth = 1;

  for (let x = Math.floor(bounds.minX / gridStep) * gridStep; x <= bounds.maxX; x += gridStep) {
    const a = mapPointToCanvas({ x_m: x, y_m: bounds.minY }, bounds, width, height, padding);
    const b = mapPointToCanvas({ x_m: x, y_m: bounds.maxY }, bounds, width, height, padding);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (let y = Math.floor(bounds.minY / gridStep) * gridStep; y <= bounds.maxY; y += gridStep) {
    const a = mapPointToCanvas({ x_m: bounds.minX, y_m: y }, bounds, width, height, padding);
    const b = mapPointToCanvas({ x_m: bounds.maxX, y_m: y }, bounds, width, height, padding);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(47, 151, 255, 0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  state.points.forEach((point, index) => {
    const p = mapPointToCanvas(point, bounds, width, height, padding);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  const travelled = state.points.slice(0, state.currentSegmentIndex + 1);
  if (state.currentFrame) travelled.push(state.currentFrame);

  if (travelled.length > 1) {
    ctx.strokeStyle = "#ff9f56";
    ctx.lineWidth = 3;
    ctx.beginPath();
    travelled.forEach((point, index) => {
      const p = mapPointToCanvas(point, bounds, width, height, padding);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  const start = mapPointToCanvas(state.points[0], bounds, width, height, padding);
  const end = mapPointToCanvas(state.points[state.points.length - 1], bounds, width, height, padding);

  ctx.fillStyle = "#2f97ff";
  ctx.beginPath();
  ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff9f56";
  ctx.beginPath();
  ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
  ctx.fill();

  if (state.currentFrame) {
    const marker = mapPointToCanvas(state.currentFrame, bounds, width, height, padding);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#2f97ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const heading = ((90 - state.currentFrame.yaw_deg) * Math.PI) / 180;
    ctx.strokeStyle = "#2f97ff";
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y);
    ctx.lineTo(marker.x + Math.cos(heading) * 22, marker.y - Math.sin(heading) * 22);
    ctx.stroke();
  }

  ctx.fillStyle = "#7a91aa";
  ctx.font = "600 12px Segoe UI Variable";
  ctx.fillText("Coordinate preview", 24, 24);
}

function ensureLeaflet() {
  if (window.L) return Promise.resolve(true);
  if (state.leafletAttempted) return Promise.resolve(false);

  state.leafletAttempted = true;
  return new Promise((resolve) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function updateMapLayerButton() {
  if (!state.mapLayerButton) return;

  const showingSatellite = state.mapLayerMode === "satellite";
  state.mapLayerButton.textContent = showingSatellite ? "Map" : "Satellite";
  state.mapLayerButton.title = showingSatellite ? "Switch to map" : "Switch to satellite map";
  state.mapLayerButton.setAttribute("aria-pressed", String(showingSatellite));
}

function setMapLayerMode(mode) {
  if (!state.map || !state.streetLayer || !state.satelliteLayer) return;

  const nextMode = mode === "satellite" ? "satellite" : "street";
  const nextLayer = nextMode === "satellite" ? state.satelliteLayer : state.streetLayer;
  const previousLayer = nextMode === "satellite" ? state.streetLayer : state.satelliteLayer;

  if (state.map.hasLayer(previousLayer)) state.map.removeLayer(previousLayer);
  if (!state.map.hasLayer(nextLayer)) nextLayer.addTo(state.map);

  state.mapLayerMode = nextMode;
  updateMapLayerButton();
}

function addMapLayerToggleControl() {
  if (!state.map || state.mapLayerButton) return;

  const LayerToggleControl = window.L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const container = window.L.DomUtil.create("div", "leaflet-control map-layer-toggle-control");
      const button = window.L.DomUtil.create("button", "map-layer-toggle", container);
      button.type = "button";
      button.addEventListener("click", () => {
        setMapLayerMode(state.mapLayerMode === "satellite" ? "street" : "satellite");
      });
      window.L.DomEvent.disableClickPropagation(container);
      window.L.DomEvent.disableScrollPropagation(container);
      state.mapLayerButton = button;
      updateMapLayerButton();
      return container;
    },
  });

  state.map.addControl(new LayerToggleControl());
}

async function syncLeafletMap() {
  if (!state.points.length) return;

  const loaded = await ensureLeaflet();
  if (!loaded || !window.L) {
    dom.leafletMap.classList.add("hidden");
    dom.fallbackMap.classList.remove("hidden");
    state.mapMode = "fallback";
    drawFallbackMap();
    return;
  }

  if (!state.map) {
    state.map = window.L.map(dom.leafletMap, {
      zoomControl: true,
      attributionControl: true,
    });

    state.streetLayer = window.L.tileLayer(STREET_TILE_URL, {
      maxZoom: 19,
      attribution: STREET_TILE_ATTRIBUTION,
    });

    state.satelliteLayer = window.L.tileLayer(SATELLITE_TILE_URL, {
      maxZoom: 19,
      attribution: SATELLITE_TILE_ATTRIBUTION,
    });

    setMapLayerMode("street");
    addMapLayerToggleControl();

    state.fullPathLayer = window.L.polyline([], {
      color: "#3fbcb3",
      weight: 3,
      opacity: 0.72,
    }).addTo(state.map);

    state.flownPathLayer = window.L.polyline([], {
      color: "#ff8c42",
      weight: 4,
      opacity: 0.95,
    }).addTo(state.map);

    state.markerLayer = window.L.circleMarker([0, 0], {
      radius: 7,
      color: "#091118",
      weight: 2,
      fillColor: "#edf5f8",
      fillOpacity: 1,
    }).addTo(state.map);
  }

  const latLngs = state.points.map((point) => [point.latitude, point.longitude]);
  state.fullPathLayer.setLatLngs(latLngs);
  state.map.fitBounds(latLngs, { padding: [24, 24] });

  dom.leafletMap.classList.remove("hidden");
  dom.fallbackMap.classList.add("hidden");
  state.mapMode = "leaflet";
  updateLeafletPlayback();

  setTimeout(() => {
    if (state.map) state.map.invalidateSize();
  }, 50);
}

function updateLeafletPlayback() {
  if (!state.map || !state.currentFrame) return;

  const travelled = state.points
    .slice(0, state.currentSegmentIndex + 1)
    .map((point) => [point.latitude, point.longitude]);
  travelled.push([state.currentFrame.latitude, state.currentFrame.longitude]);

  state.flownPathLayer.setLatLngs(travelled);
  state.markerLayer.setLatLng([state.currentFrame.latitude, state.currentFrame.longitude]);
}
function vec(x, y, z) {
  return { x, y, z };
}

function subtract(a, b) {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function add(a, b) {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scaleVec(v, factor) {
  return vec(v.x * factor, v.y * factor, v.z * factor);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x
  );
}

function length3(v) {
  return Math.sqrt(dot(v, v));
}

function normalize(v) {
  const size = length3(v) || 1;
  return vec(v.x / size, v.y / size, v.z / size);
}

function adjustZ(z, scene) {
  return scene.groundZ + (z - scene.groundZ) * scene.verticalExaggeration;
}

function computeSceneBounds(points) {
  if (!points.length) {
    return {
      min_x_m: -20,
      max_x_m: 20,
      min_y_m: -20,
      max_y_m: 20,
      min_z_m: 0,
      max_z_m: 20,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  points.forEach((point) => {
    minX = Math.min(minX, Number(point.x_m || 0));
    maxX = Math.max(maxX, Number(point.x_m || 0));
    minY = Math.min(minY, Number(point.y_m || 0));
    maxY = Math.max(maxY, Number(point.y_m || 0));
    minZ = Math.min(minZ, Number(point.z_m || 0));
    maxZ = Math.max(maxZ, Number(point.z_m || 0));
  });

  return {
    min_x_m: minX,
    max_x_m: maxX,
    min_y_m: minY,
    max_y_m: maxY,
    min_z_m: minZ,
    max_z_m: maxZ,
  };
}

function buildScenePoints(points, totalDistance = 0) {
  if (!points.length) return [];
  if (points.length < 3) return points.map((point) => ({ ...point }));

  const rawBounds = computeSceneBounds(points);
  const horizontalSpan = Math.max(rawBounds.max_x_m - rawBounds.min_x_m, rawBounds.max_y_m - rawBounds.min_y_m, 1);
  const compactFactor = Math.max(
    clamp((28 - horizontalSpan) / 24, 0, 1),
    clamp((42 - Number(totalDistance || 0)) / 34, 0, 1)
  );
  const smoothFactor = clamp(0.18 + compactFactor * 0.54, 0.18, 0.72);
  const radius = horizontalSpan < 10 ? 4 : horizontalSpan < 26 ? 3 : 2;
  const centerX = (rawBounds.min_x_m + rawBounds.max_x_m) / 2;
  const centerY = (rawBounds.min_y_m + rawBounds.max_y_m) / 2;
  const displayBoost = 1 + compactFactor * 1.35;

  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) {
      return { ...point };
    }

    let totalWeight = 0;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const neighbor = points[index + offset];
      if (!neighbor) continue;

      const weight = radius + 1 - Math.abs(offset);
      totalWeight += weight;
      sumX += neighbor.x_m * weight;
      sumY += neighbor.y_m * weight;
      sumZ += neighbor.z_m * weight;
    }

    const avgX = sumX / Math.max(totalWeight, 1);
    const avgY = sumY / Math.max(totalWeight, 1);
    const avgZ = sumZ / Math.max(totalWeight, 1);
    const edgeWeight = clamp(Math.min(index, points.length - 1 - index) / (radius + 1), 0.28, 1);
    const blend = smoothFactor * edgeWeight;

    const smoothX = lerp(point.x_m, avgX, blend);
    const smoothY = lerp(point.y_m, avgY, blend);
    const smoothZ = lerp(point.z_m, avgZ, blend * 0.45);
    const stretchedX = centerX + (smoothX - centerX) * displayBoost;
    const stretchedY = centerY + (smoothY - centerY) * displayBoost;
    const altitudeOffset = smoothZ - point.z_m;

    return {
      ...point,
      x_m: stretchedX,
      y_m: stretchedY,
      z_m: smoothZ,
      height_m: smoothZ,
      altitude_m: Number(point.altitude_m || 0) + altitudeOffset,
    };
  });
}

function buildSceneConfig(flight, scenePoints = []) {
  const bounds = scenePoints.length
    ? computeSceneBounds(scenePoints)
    : flight.local_bounds || {
        min_x_m: -20,
        max_x_m: 20,
        min_y_m: -20,
        max_y_m: 20,
        min_z_m: 0,
        max_z_m: 20,
      };

  const spanX = Math.max(bounds.max_x_m - bounds.min_x_m, 8);
  const spanY = Math.max(bounds.max_y_m - bounds.min_y_m, 8);
  const spanZ = Math.max(bounds.max_z_m - bounds.min_z_m, 4);
  const horizontalSpan = Math.max(spanX, spanY, 10);
  const verticalExaggeration = clamp(horizontalSpan / Math.max(spanZ, 1.2) / 2.7, 1.35, 5.8);
  const elevatedSpanZ = spanZ * verticalExaggeration;
  const focusSpan = Math.max(horizontalSpan * 0.78, elevatedSpanZ * 0.82, 9);
  const compactBoost = clamp(28 / horizontalSpan, 0.55, 1.9);
  const distance = focusSpan * 1.72;

  return {
    bounds,
    centerX: (bounds.min_x_m + bounds.max_x_m) / 2,
    centerY: (bounds.min_y_m + bounds.max_y_m) / 2,
    groundZ: Math.min(bounds.min_z_m, 0),
    verticalExaggeration,
    yawDeg: -124,
    pitchDeg: horizontalSpan < 20 ? 24 : 27,
    distance,
    minDistance: Math.max(focusSpan * 0.56, 9),
    maxDistance: focusSpan * 4.2,
    pathStrokeBoost: clamp(0.74 + compactBoost * 0.16, 0.82, 1.08),
    guideStrokeBoost: clamp(0.84 + compactBoost * 0.12, 0.9, 1.12),
    droneScale: clamp(horizontalSpan * 0.026, 1.05, 3.2),
  };
}

function getCameraRig(scene, width, height) {
  const yaw = (scene.yawDeg * Math.PI) / 180;
  const pitch = (scene.pitchDeg * Math.PI) / 180;
  const target = vec(
    scene.centerX,
    scene.centerY,
    adjustZ(scene.groundZ + (scene.bounds.max_z_m - scene.groundZ) * 0.18, scene)
  );

  const camera = vec(
    target.x + scene.distance * Math.cos(pitch) * Math.cos(yaw),
    target.y + scene.distance * Math.cos(pitch) * Math.sin(yaw),
    target.z + scene.distance * Math.sin(pitch)
  );

  const forward = normalize(subtract(target, camera));
  let right = cross(forward, vec(0, 0, 1));
  if (length3(right) < 1e-5) right = vec(1, 0, 0);
  right = normalize(right);
  const up = normalize(cross(right, forward));

  return {
    camera,
    forward,
    right,
    up,
    focal: Math.min(width, height) * 1.2,
    centerX: width / 2,
    centerY: height * 0.62,
  };
}

function projectPoint3D(point, scene, rig) {
  const adjusted = vec(point.x, point.y, adjustZ(point.z, scene));
  const rel = subtract(adjusted, rig.camera);
  const depth = dot(rel, rig.forward);
  if (depth <= 1) return null;

  const scale = rig.focal / depth;
  return {
    x: rig.centerX + dot(rel, rig.right) * scale,
    y: rig.centerY - dot(rel, rig.up) * scale,
    depth,
    scale,
  };
}

function rotateDronePoint(local, yawDeg, pitchDeg, rollDeg) {
  const yaw = ((90 - yawDeg) * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const roll = (rollDeg * Math.PI) / 180;

  let x = local.x;
  let y = local.y;
  let z = local.z;

  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const x1 = x * cosRoll + z * sinRoll;
  const z1 = -x * sinRoll + z * cosRoll;
  const y1 = y;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const y2 = y1 * cosPitch - z1 * sinPitch;
  const z2 = y1 * sinPitch + z1 * cosPitch;
  const x2 = x1;

  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  return {
    x: x2 * cosYaw - y2 * sinYaw,
    y: x2 * sinYaw + y2 * cosYaw,
    z: z2,
  };
}

function projectWorldPoints3D(points, scene, rig) {
  const projectedPoints = [];
  let totalDepth = 0;
  let totalScale = 0;

  for (const point of points) {
    const projected = projectPoint3D(point, scene, rig);
    if (!projected) return null;
    projectedPoints.push(projected);
    totalDepth += projected.depth;
    totalScale += projected.scale;
  }

  return {
    points: projectedPoints,
    depth: totalDepth / Math.max(projectedPoints.length, 1),
    scale: totalScale / Math.max(projectedPoints.length, 1),
  };
}

function drawSegment3D(ctx, scene, rig, a, b, color, width, alpha = 1) {
  const p1 = projectPoint3D(a, scene, rig);
  const p2 = projectPoint3D(b, scene, rig);
  if (!p1 || !p2) return;

  const depthFade = clamp(1.25 - ((p1.depth + p2.depth) / 2) / (scene.distance * 3.8), 0.18, 1);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * depthFade;
  ctx.lineWidth = Math.max(0.8, width * ((p1.scale + p2.scale) / 2) * 42);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawProjectedPolygon(ctx, scene, projectedShape, fillStyle, strokeStyle, alpha = 1, lineWidth = 1, glow = 0) {
  if (!projectedShape || projectedShape.points.length < 3) return;

  const depthFade = clamp(1.18 - projectedShape.depth / (scene.distance * 3.4), 0.28, 1);
  ctx.save();
  ctx.globalAlpha = alpha * depthFade;
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle || fillStyle;
  ctx.lineWidth = Math.max(0.7, lineWidth * projectedShape.scale * 42);
  ctx.lineJoin = "round";

  if (glow > 0) {
    ctx.shadowBlur = glow;
    ctx.shadowColor = strokeStyle || fillStyle;
  }

  ctx.beginPath();
  ctx.moveTo(projectedShape.points[0].x, projectedShape.points[0].y);
  for (let index = 1; index < projectedShape.points.length; index += 1) {
    ctx.lineTo(projectedShape.points[index].x, projectedShape.points[index].y);
  }
  ctx.closePath();
  ctx.fill();
  if (strokeStyle) ctx.stroke();
  ctx.restore();
}

function projectPolyline3D(points, scene, rig, getZ) {
  return points
    .map((point) => projectPoint3D(vec(point.x_m, point.y_m, getZ(point)), scene, rig))
    .filter(Boolean);
}

function drawProjectedPolyline(ctx, scene, projectedShape, color, width, alpha = 1, glow = 0, closed = false) {
  if (!projectedShape || projectedShape.points.length < 2) return;

  const depthFade = clamp(1.22 - projectedShape.depth / (scene.distance * 3.6), 0.24, 1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * depthFade;
  ctx.lineWidth = Math.max(0.9, width * projectedShape.scale * 42);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (glow > 0) {
    ctx.shadowBlur = glow;
    ctx.shadowColor = color;
  }

  ctx.beginPath();
  ctx.moveTo(projectedShape.points[0].x, projectedShape.points[0].y);
  for (let index = 1; index < projectedShape.points.length; index += 1) {
    ctx.lineTo(projectedShape.points[index].x, projectedShape.points[index].y);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawProjectedPath(ctx, scene, projectedPoints, color, width, alpha = 1, glow = 0) {
  if (projectedPoints.length < 2) return;

  const averageScale = projectedPoints.reduce((sum, point) => sum + point.scale, 0) / projectedPoints.length;
  const averageDepth = projectedPoints.reduce((sum, point) => sum + point.depth, 0) / projectedPoints.length;
  const depthFade = clamp(1.22 - averageDepth / (scene.distance * 3.6), 0.24, 1);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * depthFade;
  ctx.lineWidth = Math.max(0.9, width * averageScale * 24);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (glow > 0) {
    ctx.shadowBlur = glow;
    ctx.shadowColor = color;
  }

  ctx.beginPath();
  ctx.moveTo(projectedPoints[0].x, projectedPoints[0].y);
  for (let index = 1; index < projectedPoints.length; index += 1) {
    ctx.lineTo(projectedPoints[index].x, projectedPoints[index].y);
  }
  ctx.stroke();
  ctx.restore();
}

function buildPrismFaces(vertices, colors) {
  const alpha = colors.alpha ?? 1;
  const lineWidth = colors.lineWidth ?? 0.022;
  const glow = colors.glow ?? 0;

  return [
    { type: "polygon", points: [vertices.ftl, vertices.ftr, vertices.btr, vertices.btl], fill: colors.top, stroke: colors.stroke, alpha, lineWidth, glow },
    { type: "polygon", points: [vertices.fbl, vertices.fbr, vertices.bbr, vertices.bbl], fill: colors.bottom || colors.back, stroke: colors.stroke, alpha: alpha * 0.88, lineWidth },
    { type: "polygon", points: [vertices.ftl, vertices.ftr, vertices.fbr, vertices.fbl], fill: colors.front, stroke: colors.stroke, alpha: alpha * 0.96, lineWidth },
    { type: "polygon", points: [vertices.ftr, vertices.btr, vertices.bbr, vertices.fbr], fill: colors.right, stroke: colors.stroke, alpha: alpha * 0.93, lineWidth },
    { type: "polygon", points: [vertices.ftl, vertices.btl, vertices.bbl, vertices.fbl], fill: colors.left, stroke: colors.stroke, alpha: alpha * 0.93, lineWidth },
    { type: "polygon", points: [vertices.btl, vertices.btr, vertices.bbr, vertices.bbl], fill: colors.back, stroke: colors.stroke, alpha: alpha * 0.9, lineWidth },
  ];
}

function buildDroneBox(center, size, colors) {
  const halfX = size.x / 2;
  const halfY = size.y / 2;
  const halfZ = size.z / 2;

  return buildPrismFaces({
    ftl: vec(center.x + halfX, center.y - halfY, center.z + halfZ),
    ftr: vec(center.x + halfX, center.y + halfY, center.z + halfZ),
    fbl: vec(center.x + halfX, center.y - halfY, center.z - halfZ),
    fbr: vec(center.x + halfX, center.y + halfY, center.z - halfZ),
    btl: vec(center.x - halfX, center.y - halfY, center.z + halfZ),
    btr: vec(center.x - halfX, center.y + halfY, center.z + halfZ),
    bbl: vec(center.x - halfX, center.y - halfY, center.z - halfZ),
    bbr: vec(center.x - halfX, center.y + halfY, center.z - halfZ),
  }, colors);
}

function buildDroneBeam(start, end, width, height, colors) {
  const axis = normalize(subtract(end, start));
  let side = cross(axis, vec(0, 0, 1));
  if (length3(side) < 1e-5) side = cross(axis, vec(0, 1, 0));
  side = scaleVec(normalize(side), width / 2);
  const up = scaleVec(normalize(cross(side, axis)), height / 2);

  return buildPrismFaces({
    ftl: add(add(start, side), up),
    ftr: add(subtract(start, side), up),
    fbl: subtract(add(start, side), up),
    fbr: subtract(subtract(start, side), up),
    btl: add(add(end, side), up),
    btr: add(subtract(end, side), up),
    bbl: subtract(add(end, side), up),
    bbr: subtract(subtract(end, side), up),
  }, colors);
}

function buildRotorRing(center, radius, segments = 28) {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(vec(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle) * radius,
      center.z
    ));
  }
  return points;
}

function buildVerticalRing(center, radius, segments = 18) {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(vec(
      center.x,
      center.y + Math.cos(angle) * radius,
      center.z + Math.sin(angle) * radius
    ));
  }
  return points;
}

function buildRotorBlade(center, angleDeg, length, width, thickness, colors) {
  const angle = (angleDeg * Math.PI) / 180;
  const offset = vec(Math.cos(angle) * (length / 2), Math.sin(angle) * (length / 2), 0);
  return buildDroneBeam(subtract(center, offset), add(center, offset), width, thickness, colors);
}

function transformDroneLocalPoint(frame, localPoint, scale) {
  const yaw = Number.isFinite(frame?.yaw_deg) ? frame.yaw_deg : Number(frame?.bearing_deg || 0);
  const pitch = Number(frame?.pitch_deg || 0);
  const roll = Number(frame?.roll_deg || 0);
  const rotated = rotateDronePoint(scaleVec(localPoint, scale), yaw, pitch, roll);
  return vec(
    Number(frame?.x_m || 0) + rotated.x,
    Number(frame?.y_m || 0) + rotated.y,
    Number(frame?.z_m || 0) + rotated.z
  );
}

function transformDroneLocalPoints(frame, points, scale) {
  return points.map((point) => transformDroneLocalPoint(frame, point, scale));
}

function drawDroneModel(ctx, scene, rig, frame) {
  if (!frame) return;

  const scale = scene.droneScale;
  const rotorCenters = [
    vec(0.96, -0.68, 0.14),
    vec(0.96, 0.68, 0.14),
    vec(-0.78, -0.84, 0.12),
    vec(-0.78, 0.84, 0.12),
  ];
  const armRoots = [
    vec(0.22, -0.18, 0.04),
    vec(0.22, 0.18, 0.04),
    vec(-0.2, -0.22, 0.03),
    vec(-0.2, 0.22, 0.03),
  ];
  const renderables = [];

  const pushSolids = (parts) => {
    parts.forEach((part) => {
      renderables.push({
        ...part,
        points: transformDroneLocalPoints(frame, part.points, scale),
      });
    });
  };

  const pushLine = (points, color, width, alpha = 1, glow = 0, closed = false) => {
    renderables.push({
      type: "line",
      points: transformDroneLocalPoints(frame, points, scale),
      color,
      width: width * scale,
      alpha,
      glow,
      closed,
    });
  };

  const shellColors = {
    top: "rgba(232, 236, 240, 0.99)",
    bottom: "rgba(111, 120, 127, 0.96)",
    front: "rgba(206, 213, 219, 0.98)",
    right: "rgba(148, 158, 167, 0.98)",
    left: "rgba(173, 183, 191, 0.98)",
    back: "rgba(121, 131, 139, 0.98)",
    stroke: "rgba(7, 13, 19, 0.72)",
    lineWidth: 0.024,
    glow: 4,
  };
  const deckColors = {
    top: "rgba(192, 200, 208, 0.98)",
    bottom: "rgba(105, 113, 119, 0.94)",
    front: "rgba(165, 175, 183, 0.96)",
    right: "rgba(118, 126, 133, 0.95)",
    left: "rgba(138, 147, 155, 0.95)",
    back: "rgba(96, 104, 111, 0.95)",
    stroke: "rgba(13, 18, 24, 0.64)",
    lineWidth: 0.02,
  };
  const armColors = {
    top: "rgba(208, 214, 219, 0.98)",
    bottom: "rgba(94, 101, 107, 0.94)",
    front: "rgba(160, 168, 174, 0.97)",
    right: "rgba(111, 119, 125, 0.95)",
    left: "rgba(129, 137, 144, 0.95)",
    back: "rgba(98, 106, 112, 0.95)",
    stroke: "rgba(10, 14, 18, 0.58)",
    lineWidth: 0.018,
  };
  const motorColors = {
    top: "rgba(74, 82, 89, 0.98)",
    bottom: "rgba(30, 35, 40, 0.98)",
    front: "rgba(55, 63, 69, 0.98)",
    right: "rgba(38, 45, 51, 0.98)",
    left: "rgba(44, 51, 57, 0.98)",
    back: "rgba(31, 37, 42, 0.98)",
    stroke: "rgba(6, 10, 14, 0.72)",
    lineWidth: 0.018,
  };
  const accentColors = {
    top: "rgba(255, 162, 101, 0.97)",
    bottom: "rgba(153, 78, 35, 0.95)",
    front: "rgba(237, 131, 71, 0.98)",
    right: "rgba(194, 98, 48, 0.96)",
    left: "rgba(214, 115, 58, 0.96)",
    back: "rgba(173, 86, 39, 0.96)",
    stroke: "rgba(70, 31, 13, 0.55)",
    lineWidth: 0.018,
    glow: 3,
  };
  const bladeColors = {
    top: "rgba(29, 35, 41, 0.9)",
    bottom: "rgba(8, 11, 14, 0.88)",
    front: "rgba(19, 24, 29, 0.88)",
    right: "rgba(14, 18, 22, 0.88)",
    left: "rgba(17, 22, 26, 0.88)",
    back: "rgba(10, 13, 16, 0.88)",
    stroke: "rgba(0, 0, 0, 0.35)",
    lineWidth: 0.01,
  };
  const gearColors = {
    top: "rgba(100, 110, 118, 0.96)",
    bottom: "rgba(34, 40, 46, 0.94)",
    front: "rgba(75, 84, 91, 0.95)",
    right: "rgba(48, 55, 61, 0.95)",
    left: "rgba(57, 65, 72, 0.95)",
    back: "rgba(43, 49, 55, 0.95)",
    stroke: "rgba(9, 12, 16, 0.5)",
    lineWidth: 0.014,
  };
  const gimbalColors = {
    top: "rgba(52, 60, 68, 0.98)",
    bottom: "rgba(18, 23, 28, 0.98)",
    front: "rgba(34, 41, 47, 0.98)",
    right: "rgba(23, 28, 33, 0.98)",
    left: "rgba(27, 32, 38, 0.98)",
    back: "rgba(21, 25, 29, 0.98)",
    stroke: "rgba(4, 7, 9, 0.68)",
    lineWidth: 0.016,
  };

  pushSolids(buildDroneBox(vec(0.02, 0, 0.01), vec(0.9, 0.46, 0.18), shellColors));
  pushSolids(buildDroneBox(vec(-0.08, 0, 0.12), vec(0.48, 0.3, 0.08), deckColors));
  pushSolids(buildDroneBox(vec(0.42, 0, 0.03), vec(0.34, 0.34, 0.13), accentColors));
  pushSolids(buildDroneBox(vec(0.14, -0.19, -0.04), vec(0.18, 0.1, 0.08), deckColors));
  pushSolids(buildDroneBox(vec(0.14, 0.19, -0.04), vec(0.18, 0.1, 0.08), deckColors));
  pushSolids(buildDroneBox(vec(-0.38, 0, 0.03), vec(0.28, 0.24, 0.09), deckColors));

  armRoots.forEach((root, index) => {
    pushSolids(buildDroneBeam(root, rotorCenters[index], index < 2 ? 0.12 : 0.11, 0.05, armColors));
  });

  rotorCenters.forEach((center, index) => {
    pushSolids(buildDroneBox(center, vec(0.18, 0.18, 0.09), motorColors));
    pushSolids(buildDroneBox(vec(center.x, center.y, center.z + 0.07), vec(0.09, 0.09, 0.035), accentColors));
    pushSolids(buildRotorBlade(center, index % 2 === 0 ? 24 : -24, 0.56, 0.05, 0.012, bladeColors));
    pushLine(buildRotorRing(vec(center.x, center.y, center.z + 0.02), 0.32, 30), "rgba(255, 255, 255, 0.18)", 0.018, 0.55, 0, true);
    pushLine(buildRotorRing(vec(center.x, center.y, center.z + 0.03), 0.26, 28), "rgba(71, 212, 200, 0.9)", 0.034, 0.98, 7, true);
  });

  [
    [vec(0.28, -0.22, -0.04), vec(0.21, -0.31, -0.3)],
    [vec(0.28, 0.22, -0.04), vec(0.21, 0.31, -0.3)],
    [vec(-0.2, -0.17, -0.03), vec(-0.28, -0.23, -0.25)],
    [vec(-0.2, 0.17, -0.03), vec(-0.28, 0.23, -0.25)],
    [vec(0.21, -0.31, -0.3), vec(0.07, -0.31, -0.32)],
    [vec(0.21, 0.31, -0.3), vec(0.07, 0.31, -0.32)],
    [vec(-0.28, -0.23, -0.25), vec(-0.38, -0.23, -0.27)],
    [vec(-0.28, 0.23, -0.25), vec(-0.38, 0.23, -0.27)],
  ].forEach((pair) => {
    pushSolids(buildDroneBeam(pair[0], pair[1], 0.032, 0.028, gearColors));
  });

  [
    [vec(0.3, -0.06, -0.05), vec(0.4, -0.06, -0.15)],
    [vec(0.3, 0.06, -0.05), vec(0.4, 0.06, -0.15)],
  ].forEach((pair) => {
    pushSolids(buildDroneBeam(pair[0], pair[1], 0.022, 0.022, gearColors));
  });

  pushSolids(buildDroneBox(vec(0.47, 0, -0.19), vec(0.16, 0.15, 0.12), gimbalColors));
  pushLine(buildVerticalRing(vec(0.55, 0, -0.19), 0.05, 22), "rgba(71, 212, 200, 0.92)", 0.02, 0.95, 4, true);

  const projectedRenderables = renderables
    .map((renderable) => ({
      ...renderable,
      projected: projectWorldPoints3D(renderable.points, scene, rig),
    }))
    .filter((renderable) => renderable.projected);

  projectedRenderables
    .sort((left, right) => right.projected.depth - left.projected.depth)
    .forEach((renderable) => {
      if (renderable.type === "polygon") {
        drawProjectedPolygon(
          ctx,
          scene,
          renderable.projected,
          renderable.fill,
          renderable.stroke,
          renderable.alpha,
          renderable.lineWidth,
          renderable.glow || 0
        );
        return;
      }

      drawProjectedPolyline(
        ctx,
        scene,
        renderable.projected,
        renderable.color,
        renderable.width,
        renderable.alpha,
        renderable.glow || 0,
        renderable.closed || false
      );
    });
}

function getThreeStatusEl() {
  if (state.three.statusEl) return state.three.statusEl;

  const statusEl = document.createElement("div");
  statusEl.className = "scene-status hidden";
  (dom.sceneOverlay || dom.sceneCanvas).appendChild(statusEl);
  state.three.statusEl = statusEl;
  return statusEl;
}

function setThreeStatus(message = "") {
  const statusEl = getThreeStatusEl();
  if (!message) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    return;
  }

  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}

async function ensureThreeRuntime() {
  if (state.three.runtime) return state.three.runtime;
  if (state.three.bundlePromise) return state.three.bundlePromise;

  state.three.bundlePromise = Promise.all([
    import('/static/vendor/three/three.module.js?v=' + THREE_VERSION),
    import('/static/vendor/three/GLTFLoader.js?v=' + THREE_VERSION),
  ])
    .then(([THREE, loaderModule]) => {
      state.three.runtime = {
        THREE,
        GLTFLoader: loaderModule.GLTFLoader,
      };
      return state.three.runtime;
    })
    .catch((error) => {
      state.three.failed = true;
      state.three.error = `3D ?? ?? ??: ${error.message || error}`;
      throw error;
    });

  return state.three.bundlePromise;
}

function sceneCoordsToThree(x, y, z) {
  const { THREE } = state.three.runtime;
  return new THREE.Vector3(Number(x || 0), adjustZ(Number(z || 0), state.scene), -Number(y || 0));
}

function scenePointToThree(point) {
  return sceneCoordsToThree(point.x_m, point.y_m, point.z_m);
}

function directionToThree(direction) {
  const { THREE } = state.three.runtime;
  return new THREE.Vector3(direction.x, direction.z, -direction.y).normalize();
}

function removeThreeObject(object) {
  if (!object) return;
  if (object.parent) object.parent.remove(object);
  if (object.geometry) object.geometry.dispose();
  if (object.material) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material?.dispose?.());
  }
}

function setThreeLinePoints(line, points) {
  const { THREE } = state.three.runtime;
  if (line.geometry) line.geometry.dispose();
  line.geometry = new THREE.BufferGeometry().setFromPoints(points.length ? points : [new THREE.Vector3(0, 0, 0)]);
}

function updateThreeCamera() {
  if (!state.three.camera || !state.scene || !state.three.runtime) return;

  const size = getElementSize(dom.sceneCanvas);
  const scene = state.scene;
  const camera = state.three.camera;
  const yaw = (scene.yawDeg * Math.PI) / 180;
  const pitch = (scene.pitchDeg * Math.PI) / 180;
  const horizontalDistance = scene.distance * Math.cos(pitch);
  const target = sceneCoordsToThree(
    scene.centerX,
    scene.centerY,
    scene.groundZ + (scene.bounds.max_z_m - scene.groundZ) * 0.18
  );

  camera.aspect = size.width / Math.max(size.height, 1);
  camera.fov = size.width < 880 ? 52 : 45;
  camera.position.set(
    target.x + horizontalDistance * Math.cos(yaw),
    target.y + scene.distance * Math.sin(pitch),
    target.z - horizontalDistance * Math.sin(yaw)
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

function syncThreeSceneLayout() {
  if (!state.three.renderer || !state.three.camera) return false;

  const rawWidth = dom.sceneCanvas.clientWidth;
  const rawHeight = dom.sceneCanvas.clientHeight;
  if (rawWidth < 8 || rawHeight < 8) return false;

  const size = {
    width: Math.max(1, Math.floor(rawWidth)),
    height: Math.max(1, Math.floor(rawHeight)),
  };
  state.three.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.three.renderer.setSize(size.width, size.height, false);
  updateThreeCamera();
  return true;
}

async function loadThreeDroneModel() {
  const { THREE, GLTFLoader } = state.three.runtime;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(DRONE_MODEL_URL);
  const rawRoot = gltf.scene || gltf.scenes[0];

  rawRoot.traverse((node) => {
    if (!node.isMesh) return;
    if (!node.material) return;

    if (Array.isArray(node.material)) {
      node.material = node.material.map((material) => material.clone());
      return;
    }

    node.material = node.material.clone();
  });

  rawRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rawRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  rawRoot.position.sub(center);

  const dominantHorizontal = size.x > size.z * 1.08;
  if (dominantHorizontal) {
    rawRoot.rotation.y = -Math.PI / 2;
  }

  const droneRoot = new THREE.Group();
  droneRoot.add(rawRoot);
  state.three.droneRoot = droneRoot;
  state.three.droneModelBaseScale = 1.9 / Math.max(size.x, size.y, size.z, 0.001);
  state.three.worldRoot.add(droneRoot);
}

function ensureThreePlaceholder() {
  if (!state.three.runtime || !state.three.worldRoot) return null;
  if (state.three.placeholderRoot) return state.three.placeholderRoot;

  const { THREE } = state.three.runtime;
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x62b7ff,
    emissive: 0x10335a,
    metalness: 0.08,
    roughness: 0.42,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.06,
    roughness: 0.3,
  });
  const armMaterial = new THREE.MeshStandardMaterial({
    color: 0x62768b,
    metalness: 0.14,
    roughness: 0.78,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 22, 18), bodyMaterial);
  body.scale.set(1.3, 0.62, 1.7);
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.34, 18), accentMaterial);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.9, 0, 0);
  group.add(nose);

  [[0.45, 0, 0.44], [0.45, 0, -0.44], [-0.45, 0, 0.44], [-0.45, 0, -0.44]].forEach(([x, y, z]) => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.72, 4, 12), armMaterial);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(x, y, z);
    group.add(arm);

    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 18), accentMaterial);
    rotor.rotation.x = Math.PI / 2;
    rotor.position.set(x + (x > 0 ? 0.38 : -0.38), 0, z);
    group.add(rotor);
  });

  group.visible = false;
  state.three.placeholderRoot = group;
  state.three.worldRoot.add(group);
  return group;
}

function rebuildThreeFlightObjects() {
  if (!state.three.runtime || !state.three.worldRoot) return;

  removeThreeObject(state.three.grid);
  removeThreeObject(state.three.fullPathLine);
  removeThreeObject(state.three.flownPathLine);
  removeThreeObject(state.three.altitudeLine);

  state.three.grid = null;
  state.three.fullPathLine = null;
  state.three.flownPathLine = null;
  state.three.altitudeLine = null;

  if (!state.scene || !state.scenePoints.length) {
    state.three.geometryDirty = false;
    return;
  }

  const { THREE } = state.three.runtime;
  const scene = state.scene;
  const bounds = scene.bounds;
  const fullPathPoints = state.scenePoints.map((point) => scenePointToThree(point));
  const gridStep = niceStep(Math.max(bounds.max_x_m - bounds.min_x_m, bounds.max_y_m - bounds.min_y_m) / 7);
  const gridSize = Math.max(gridStep * 10, Math.max(bounds.max_x_m - bounds.min_x_m, bounds.max_y_m - bounds.min_y_m) * 1.32, 18);
  const divisions = Math.max(8, Math.round(gridSize / Math.max(gridStep, 1)));

  const grid = new THREE.GridHelper(gridSize, divisions, 0xb7d4ea, 0xdfeefa);
  grid.position.copy(sceneCoordsToThree(scene.centerX, scene.centerY, scene.groundZ));
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach((material, index) => {
    material.transparent = true;
    material.opacity = index === 0 ? 0.66 : 0.36;
  });

  const fullPathLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(fullPathPoints),
    new THREE.LineBasicMaterial({
      color: 0x9cb9d3,
      transparent: true,
      opacity: 0.72,
    })
  );

  const flownPathLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(fullPathPoints.slice(0, 1)),
    new THREE.LineBasicMaterial({
      color: 0x00bfff,
      transparent: true,
      opacity: 0.96,
    })
  );

  const altitudeLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([fullPathPoints[0], fullPathPoints[0]]),
    new THREE.LineBasicMaterial({
      color: 0xffab5c,
      transparent: true,
      opacity: 0.72,
    })
  );

  state.three.worldRoot.add(grid);
  state.three.worldRoot.add(fullPathLine);
  state.three.worldRoot.add(flownPathLine);
  state.three.worldRoot.add(altitudeLine);

  state.three.grid = grid;
  state.three.fullPathLine = fullPathLine;
  state.three.flownPathLine = flownPathLine;
  state.three.altitudeLine = altitudeLine;
  state.three.geometryDirty = false;
}

function updateThreeSceneFrame() {
  if (!state.three.renderer || !state.three.scene3d || !state.three.camera) return;

  updateThreeCamera();

  if (state.three.geometryDirty) {
    rebuildThreeFlightObjects();
  }

  const frame = state.currentSceneFrame;
  const scene = state.scene;
  const showModel = Boolean(state.three.droneRoot);
  const fallbackRoot = ensureThreePlaceholder();

  if (scene && frame) {
    const yaw = Number.isFinite(frame.yaw_deg) ? frame.yaw_deg : Number(frame.bearing_deg || 0);
    const pitch = Number(frame.pitch_deg || 0);
    const roll = Number(frame.roll_deg || 0);
    const forward = directionToThree(rotateDronePoint(vec(1, 0, 0), yaw, pitch, roll));
    const right = directionToThree(rotateDronePoint(vec(0, 1, 0), yaw, pitch, roll));
    const up = directionToThree(rotateDronePoint(vec(0, 0, 1), yaw, pitch, roll));
    const basis = new state.three.runtime.THREE.Matrix4().makeBasis(right, up, forward);
    const position = scenePointToThree(frame);
    const droneScale = state.scene.droneScale || 1;

    if (state.three.droneRoot) {
      state.three.droneRoot.position.copy(position);
      state.three.droneRoot.quaternion.setFromRotationMatrix(basis);
      state.three.droneRoot.scale.setScalar(state.three.droneModelBaseScale * droneScale);
      state.three.droneRoot.visible = true;
    }

    if (fallbackRoot) {
      fallbackRoot.position.copy(position);
      fallbackRoot.quaternion.setFromRotationMatrix(basis);
      fallbackRoot.scale.setScalar(droneScale * 0.92);
      fallbackRoot.visible = !showModel;
    }
  } else {
    if (state.three.droneRoot) state.three.droneRoot.visible = false;
    if (fallbackRoot) fallbackRoot.visible = false;
  }

  if (state.three.flownPathLine && state.scene) {
    const travelled = state.scenePoints.slice(0, state.currentSegmentIndex + 1);
    if (state.currentSceneFrame) travelled.push(state.currentSceneFrame);
    setThreeLinePoints(state.three.flownPathLine, travelled.map((point) => scenePointToThree(point)));
  }

  if (state.three.altitudeLine && state.currentSceneFrame && state.scene) {
    setThreeLinePoints(state.three.altitudeLine, [
      sceneCoordsToThree(state.currentSceneFrame.x_m, state.currentSceneFrame.y_m, state.scene.groundZ),
      scenePointToThree(state.currentSceneFrame),
    ]);
    state.three.altitudeLine.visible = true;
  } else if (state.three.altitudeLine) {
    state.three.altitudeLine.visible = false;
  }

  state.three.renderer.render(state.three.scene3d, state.three.camera);
}

async function ensureThreeScene() {
  const { THREE } = await ensureThreeRuntime();

  if (!state.three.renderer) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;

    const scene3d = new THREE.Scene();
    scene3d.background = new THREE.Color(0xf4fbff);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    const worldRoot = new THREE.Group();
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8ebfb, 2.8);
    const ambient = new THREE.AmbientLight(0xffffff, 0.62);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    const fill = new THREE.DirectionalLight(0xe7f4ff, 1.28);
    key.position.set(26, 34, 18);
    fill.position.set(-18, 12, -14);

    scene3d.add(worldRoot);
    scene3d.add(hemi);
    scene3d.add(ambient);
    scene3d.add(key);
    scene3d.add(fill);
    (dom.sceneRenderHost || dom.sceneCanvas).appendChild(renderer.domElement);

    state.three.renderer = renderer;
    state.three.scene3d = scene3d;
    state.three.camera = camera;
    state.three.worldRoot = worldRoot;
  }

  getThreeStatusEl();
  syncThreeSceneLayout();
  ensureThreePlaceholder();

  if (state.three.geometryDirty) {
    rebuildThreeFlightObjects();
  }

  if (!state.three.droneRoot && !state.three.droneModelPromise && !state.three.modelError) {
    state.three.modelLoading = true;
    setThreeStatus("Loading 3D model...");
    state.three.droneModelPromise = loadThreeDroneModel()
      .then(() => {
        state.three.modelLoading = false;
        state.three.modelError = "";
        if (state.activeTab === "scene") {
          setThreeStatus("");
          updateThreeSceneFrame();
        }
      })
      .catch((error) => {
        state.three.modelLoading = false;
        state.three.modelError = error.message || String(error);
        if (state.activeTab === "scene") {
          setThreeStatus("Model load failed. Showing fallback marker.");
          updateThreeSceneFrame();
        }
      });
  }
}

function draw3DScene() {
  if (state.activeTab !== "scene" && !state.three.renderer) {
    return;
  }

  if (!state.scene || !state.points.length) {
    setThreeStatus(state.activeTab === "scene" ? "Analyze a flight log to render the 3D scene." : "");
    if (state.three.renderer && state.three.scene3d && state.three.camera) {
      updateThreeCamera();
      state.three.renderer.render(state.three.scene3d, state.three.camera);
    }
    return;
  }

  if (state.activeTab !== "scene") {
    return;
  }

  if (state.three.failed) {
    setThreeStatus(state.three.error || "3D scene initialization failed.");
    return;
  }

  ensureThreeScene()
    .then(() => {
      if (state.three.modelLoading) {
        setThreeStatus("Loading 3D model...");
      } else if (state.three.modelError) {
        setThreeStatus("Model load failed. Showing fallback marker.");
      } else {
        setThreeStatus("");
      }
      updateThreeSceneFrame();
    })
    .catch((error) => {
      state.three.failed = true;
      state.three.error = `3D scene initialization failed: ${error.message || error}`;
      setThreeStatus(state.three.error);
    });
}

function renderAll() {
  drawDashboard();
  drawFallbackMap();
  draw3DScene();
  if (state.mapMode === "leaflet") updateLeafletPlayback();
}

function updatePlaybackFrame() {
  if (!state.points.length) {
    state.currentFrame = null;
    state.currentSceneFrame = null;
    dom.timelineRange.value = 0;
    dom.timelineLabel.textContent = "0.0s / 0.0s";
    setTimelineProgress(0, 0);
    updateLiveMetrics(null);
    renderAll();
    return;
  }

  const duration = state.points[state.points.length - 1].time_s;
  state.currentTime = clamp(state.currentTime, 0, duration);
  state.currentFrame = interpolateFrame(state.points, state.currentTime);
  state.currentSceneFrame = state.scenePoints.length
    ? interpolateFrame(state.scenePoints, state.currentTime)
    : state.currentFrame;
  state.currentSegmentIndex = state.currentFrame ? state.currentFrame._segmentIndex : 0;
  dom.timelineRange.value = String(state.currentTime);
  dom.timelineLabel.textContent = `${state.currentTime.toFixed(1)}s / ${duration.toFixed(1)}s`;
  setTimelineProgress(state.currentTime, duration);
  updateLiveMetrics(state.currentFrame);
  renderAll();
}

function stopPlayback() {
  state.playing = false;
  state.lastAnimationTs = 0;
}

function animationLoop(timestamp) {
  if (state.playing && state.points.length) {
    if (!state.lastAnimationTs) state.lastAnimationTs = timestamp;
    const elapsedMs = timestamp - state.lastAnimationTs;
    state.lastAnimationTs = timestamp;
    state.currentTime += (elapsedMs / 1000) * state.playbackRate;

    const duration = state.points[state.points.length - 1].time_s;
    if (state.currentTime >= duration) {
      state.currentTime = duration;
      stopPlayback();
    }

    updatePlaybackFrame();
  } else {
    state.lastAnimationTs = 0;
  }

  window.requestAnimationFrame(animationLoop);
}

function setFlight(analysis) {
  state.flight = analysis;
  state.points = analysis.telemetry || [];
  state.scenePoints = buildScenePoints(state.points, analysis.total_distance_2d_m);
  state.currentTime = 0;
  state.currentSegmentIndex = 0;
  state.currentFrame = state.points[0] || null;
  state.currentSceneFrame = state.scenePoints[0] || state.currentFrame;
  state.scene = buildSceneConfig(analysis, state.scenePoints);
  state.three.geometryDirty = true;
  state.three.failed = false;
  state.three.error = "";
  state.three.modelLoading = false;
  state.three.modelError = "";
  if (!state.three.droneRoot) {
    state.three.droneModelPromise = null;
  }
  stopPlayback();

  dom.timelineRange.max = String(analysis.duration_s || 0);
  dom.timelineRange.value = "0";
  setTimelineProgress(0, analysis.duration_s || 0);

  updateSummary(analysis);
  updatePlaybackFrame();
  syncLeafletMap();
}

async function postAnalyze(formData) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "An error occurred while analyzing the log.");
  }
  return payload;
}

async function fetchSample() {
  const response = await fetch("/api/sample");
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Failed to load the sample flight.");
  }
  return payload;
}

function setBusy(busy) {
  dom.analyzeButton.disabled = busy;
  dom.sampleButton.disabled = busy || !window.APP_CONFIG.sampleAvailable;
  if (dom.filePickerButton) dom.filePickerButton.disabled = busy;
}

function abbreviateFilename(filename) {
  const name = String(filename || "").trim();
  if (!name) return "No file selected";
  if (name.length <= 28) return name;

  const dotIndex = name.lastIndexOf(".");
  const extension = dotIndex > 0 ? name.slice(dotIndex) : "";
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const maxStemLength = Math.max(10, 28 - extension.length - 3);

  if (stem.length <= maxStemLength) return name;
  return `${stem.slice(0, maxStemLength)}...${extension}`;
}

function updateFilePickerLabel() {
  if (!dom.filePickerLabel || !dom.fileInput) return;
  const file = dom.fileInput.files && dom.fileInput.files[0];
  dom.filePickerLabel.textContent = file ? abbreviateFilename(file.name) : "No file selected";
  dom.filePickerLabel.title = file ? file.name : "No file selected";
}

if (dom.filePickerButton && dom.fileInput) {
  dom.filePickerButton.addEventListener("click", () => {
    dom.fileInput.click();
  });
}

if (dom.fileInput) {
  dom.fileInput.addEventListener("change", () => {
    updateFilePickerLabel();
  });
}

dom.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = dom.fileInput.files[0];
  const apiKey = dom.apiKeyInput.value.trim();

  if (!file) {
    setMessage("Select a FlightRecord.txt file first.", "error");
    return;
  }
  if (!apiKey) {
    setMessage("Enter an API key.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("api_key", apiKey);
  formData.append("flight_record", file);

  try {
    setBusy(true);
    setMessage("Analyzing flight log...", "loading");
    const payload = await postAnalyze(formData);
    setFlight(payload.analysis);
    setMessage("");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setBusy(false);
  }
});

dom.sampleButton.addEventListener("click", async () => {
  try {
    setBusy(true);
    setMessage("Loading sample flight...", "loading");
    const payload = await fetchSample();
    setFlight(payload.analysis);
    setMessage("");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setBusy(false);
  }
});

dom.playButton.addEventListener("click", () => {
  if (!state.points.length) {
    setMessage("Analyze a flight log first.", "error");
    return;
  }
  setMessage("");
  state.playing = true;
});

dom.pauseButton.addEventListener("click", () => {
  stopPlayback();
});

dom.resetButton.addEventListener("click", () => {
  stopPlayback();
  state.currentTime = 0;
  updatePlaybackFrame();
});

dom.speedSelect.addEventListener("change", () => {
  state.playbackRate = Number(dom.speedSelect.value || 1);
});

dom.timelineRange.addEventListener("input", () => {
  stopPlayback();
  state.currentTime = Number(dom.timelineRange.value || 0);
  updatePlaybackFrame();
});

dom.tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tabTarget));
});

dom.sceneCanvas.addEventListener("pointerdown", (event) => {
  if (!state.scene) return;
  state.interaction.dragging = true;
  state.interaction.pointerId = event.pointerId;
  state.interaction.lastX = event.clientX;
  state.interaction.lastY = event.clientY;
  dom.sceneCanvas.setPointerCapture(event.pointerId);
});

dom.sceneCanvas.addEventListener("pointermove", (event) => {
  if (!state.interaction.dragging || !state.scene) return;

  const dx = event.clientX - state.interaction.lastX;
  const dy = event.clientY - state.interaction.lastY;
  state.interaction.lastX = event.clientX;
  state.interaction.lastY = event.clientY;

  state.scene.yawDeg += dx * 0.35;
  state.scene.pitchDeg = clamp(state.scene.pitchDeg - dy * 0.22, 12, 76);
  draw3DScene();
});

dom.sceneCanvas.addEventListener("pointerup", (event) => {
  if (state.interaction.pointerId !== null) {
    dom.sceneCanvas.releasePointerCapture(event.pointerId);
  }
  state.interaction.dragging = false;
  state.interaction.pointerId = null;
});

dom.sceneCanvas.addEventListener("pointercancel", () => {
  state.interaction.dragging = false;
  state.interaction.pointerId = null;
});

dom.sceneCanvas.addEventListener("wheel", (event) => {
  if (!state.scene) return;
  event.preventDefault();
  const factor = event.deltaY > 0 ? 1.08 : 0.92;
  state.scene.distance = clamp(state.scene.distance * factor, state.scene.minDistance, state.scene.maxDistance);
  draw3DScene();
}, { passive: false });

dom.sceneCanvas.addEventListener("dblclick", () => {
  if (!state.flight) return;
  state.scene = buildSceneConfig(state.flight, state.scenePoints);
  draw3DScene();
});

window.addEventListener("resize", () => {
  renderAll();
  if (state.map) state.map.invalidateSize();
});

switchTab("dashboard");
updateLiveMetrics(null);
updateFilePickerLabel();
setTimelineProgress(0, 0);
renderAll();

window.requestAnimationFrame(animationLoop);








