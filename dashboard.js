const byId = (id) => document.getElementById(id);
const hosted = location.origin === "https://gyu-bin.github.io"
  && ["/bibleteum-dashboard/", "/bibleteum-dashboard/index.html"].includes(location.pathname);
const local = location.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
const summaryEndpoint = "https://hwpatbgcutwjjgymfhiq.supabase.co/functions/v1/usage-analytics-summary";
const fmt = new Intl.NumberFormat("ko-KR");
const ratio = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 });
const koreanTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul",
});
const labels = {
  first_open: "처음 앱 열기",
  onboarding_completed: "첫 설정 완료",
  reading_completed: "읽기 완료",
  today_reading_completed: "오늘의 말씀 읽기 완료",
  transcription_completed: "필사 완료",
  app_lock_enabled: "앱 잠금 켜기",
  app_unlocked: "말씀 후 앱 잠금 풀기",
  premium_viewed: "프리미엄 요금제 보기",
  premium_activated: "프리미엄 시작·복원",
};
const platformName = { ios: "iPhone·iPad", android: "Android" };
const weekdayNames = ["월", "화", "수", "목", "금", "토", "일"];
const periodColumns = [
  ["활성 설치", "active_installations"], ["신규 설치", "new_installations"],
  ["읽기 완료", "reading_completed"], ["필사 완료", "transcription_completed"],
];

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function count(value) {
  return fmt.format(value ?? 0);
}

function rate(numerator, denominator) {
  return denominator > 0 ? ratio.format(numerator / denominator) : "—";
}

function metric(label, value, detail, primary = false) {
  const result = element("div", undefined, primary ? "metric primary" : "metric");
  result.append(element("p", label, "metric-label"), element("strong", value), element("p", detail, "muted"));
  return result;
}

function buildTable(caption, columns, rows) {
  const table = element("table");
  table.createCaption().textContent = caption;
  const heading = table.createTHead().insertRow();
  for (const label of columns) {
    const col = element("th", label);
    col.scope = "col";
    heading.append(col);
  }
  const body = table.createTBody();
  for (const [label, ...values] of rows) {
    const row = body.insertRow();
    const name = element("th", label);
    name.scope = "row";
    row.append(name, ...values.map((value) => element("td", count(value))));
  }
  return table;
}

function drawChart(daily) {
  const chart = byId("chart");
  chart.replaceChildren();
  const peak = Math.max(0, ...daily.map((row) => row.active_installations));
  byId("chart-peak").textContent = peak ? `일별 최고 ${count(peak)}건` : "";
  byId("chart-start").textContent = daily[0]?.day ?? "";
  byId("chart-end").textContent = daily.at(-1)?.day ?? "";
  byId("chart-empty").hidden = peak > 0;
  if (!peak) return;
  for (const y of [5, 45, 85]) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", "900");
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", "#e5ddd9");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    chart.append(line);
  }
  const width = 900 / daily.length;
  for (const [index, row] of daily.entries()) {
    const height = row.active_installations / peak * 120;
    const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bar.setAttribute("x", String(index * width + 1));
    bar.setAttribute("y", String(124 - height));
    bar.setAttribute("width", String(Math.max(1, width - 2)));
    bar.setAttribute("height", String(height));
    bar.setAttribute("rx", "2");
    bar.setAttribute("fill", "currentColor");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${row.day} · ${count(row.active_installations)}건`;
    bar.append(title);
    chart.append(bar);
  }
}

function drawFunnel(rows, total) {
  const nodes = [];
  for (const row of rows) {
    const label = labels[row.stage];
    if (!label) continue;
    const bar = element("progress");
    bar.max = Math.max(1, total);
    bar.value = row.installations;
    bar.setAttribute("aria-label", label);
    nodes.push(element("span", label), bar, element("strong", count(row.installations)));
  }
  byId("funnel").replaceChildren(...nodes);
}

function display(summary) {
  const { totals, first_reading_24h: reading, retention, daily, platforms, funnel, versions = [],
    reading_by_hour: hours = [], reading_by_weekday: weekdays = [] } = summary;
  const stat = (label, value, detail) => metric(label, count(value), detail);
  const fraction = (numerator, denominator) => `${count(numerator)} / ${count(denominator)}건`;
  byId("headline").replaceChildren(
    metric("24시간 내 첫 말씀 완료", rate(reading.completed, reading.eligible), fraction(reading.completed, reading.eligible), true),
    stat("활성 설치", totals.active_installations, "기간 중 앱을 연 설치"),
    stat("신규 설치", totals.new_installations, "기간 중 처음 연 설치"),
    metric("다음 날 재방문", rate(retention.d1.returned, retention.d1.eligible), fraction(retention.d1.returned, retention.d1.eligible)),
    metric("7일 뒤 재방문", rate(retention.d7.returned, retention.d7.eligible), fraction(retention.d7.returned, retention.d7.eligible)),
  );
  drawChart(daily);
  drawFunnel(funnel, totals.new_installations);
  byId("features-grid").replaceChildren(buildTable("", ["기능", "횟수"], Object.entries(labels)
    .filter(([name]) => name !== "first_open")
    .map(([name, label]) => [label, totals[name]])));
  const activityCount = totals.reading_completed + totals.transcription_completed;
  byId("reading-mix").textContent = activityCount
    ? `완료 비율 · 읽기 ${rate(totals.reading_completed, activityCount)} · 필사 ${rate(totals.transcription_completed, activityCount)}`
    : "이 기간에 읽기·필사 완료가 없어요.";
  const completed = (row) => [row.reading_completed, row.transcription_completed];
  byId("weekdays").replaceChildren(buildTable("요일별 완료 횟수", ["요일", "읽기", "필사"],
    weekdays.map((row) => [`${weekdayNames[row.weekday - 1]}요일`, ...completed(row)])));
  byId("hours").replaceChildren(buildTable("한국 시간 기준", ["시각", "읽기", "필사"],
    hours.map((row) => [`${String(row.hour).padStart(2, "0")}:00`, ...completed(row)])));
  const columns = periodColumns.map(([label]) => label);
  const values = (row) => periodColumns.map(([, key]) => row[key]);
  byId("daily").replaceChildren(buildTable("활성·신규·완료 건수", ["날짜", ...columns], daily.map((row) => [row.day, ...values(row)]).reverse()));
  byId("platform").replaceChildren(buildTable("기간 합계", ["기기", ...columns], platforms.map((row) => [platformName[row.platform] ?? row.platform, ...values(row)])));
  byId("versions-details").hidden = !versions.length;
  byId("versions").replaceChildren(buildTable("업데이트한 설치는 여러 버전에서 집계될 수 있어요.", ["버전", ...columns],
    versions.map((row) => [`${platformName[row.platform] ?? row.platform} · ${row.app_version}`, ...values(row)])));
}

let loading;

function showStatus(node, message, error = false) {
  node.textContent = message;
  node.toggleAttribute("data-error", error);
}

async function load() {
  loading?.abort();
  const controller = new AbortController();
  loading = controller;
  const status = byId("status");
  status.hidden = false;
  showStatus(status, "통계를 불러오는 중이에요.");
  byId("content").hidden = true;
  byId("demo").hidden = true;
  try {
    const days = byId("days").value;
    const response = hosted
      ? await fetch(`${summaryEndpoint}?public=1&days=${days}`, {
        signal: controller.signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
      })
      : await fetch(`/api/summary?days=${days}`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error("Summary unavailable");
    const payload = await response.json();
    if (controller.signal.aborted) return;
    const { demo, summary } = hosted ? { demo: false, summary: payload } : payload;
    display(summary);
    showStatus(status, Object.values(summary.totals).some((total) => total > 0)
      ? `집계 기준 ${koreanTime.format(new Date(summary.as_of))}`
      : "아직 이 기간에 들어온 데이터가 없어요.");
    byId("demo").hidden = !demo;
    byId("content").hidden = false;
  } catch {
    if (controller.signal.aborted) return;
    showStatus(status, "통계를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.", true);
  } finally {
    if (loading === controller) loading = undefined;
  }
}

if (hosted || local) {
  if (hosted) {
    try { localStorage.removeItem("bibleteum.dashboard.session.v1"); }
    catch { /* The dashboard also works when storage is disabled. */ }
  }
  byId("range").hidden = false;
  byId("days").addEventListener("change", () => void load());
  void load();
} else {
  byId("status").hidden = false;
  showStatus(byId("status"), "지원되는 대시보드 주소에서 열어 주세요.", true);
}
