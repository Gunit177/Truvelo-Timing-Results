// Connection settings and race rules come from dashboard.js on both pages.
const HISTORY_TIME_ZONE = "Africa/Johannesburg";
const HISTORY_POLL_MS = 5000;
const HISTORY_FULL_REFRESH_MS = 60000;
const HISTORY_PAGE_SIZE = 500;
const HISTORY_TIMEOUT_MS = 20000;
const HISTORY_FIELDS = ["id", "created_at", "Club", "ID1", "Driver1", "Class1", "Car1",
    "Reaction1", "Sixty1", "QuartT1", "QuartS1", "ID2", "Driver2", "Class2", "Car2",
    "Reaction2", "Sixty2", "QuartT2", "QuartS2"];

const historyState = {
    day: "", followToday: true, rows: [], latestId: null, busy: false,
    requestId: 0, controller: null, lastFullRefresh: 0, loaded: false,
    club: "", search: "", order: "newest"
};

function getSastDay(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: HISTORY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date);
    const part = type => parts.find(item => item.type === type).value;
    return `${part("year")}-${part("month")}-${part("day")}`;
}

function getDayBounds(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Please select a valid event date.");
    const start = new Date(day + "T00:00:00+02:00");
    if (!Number.isFinite(start.getTime()) || getSastDay(start) !== day) {
        throw new Error("Please select a valid event date.");
    }
    return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}

function historyRecordId(row) {
    const id = row && row.id;
    if (typeof id === "number" && (!Number.isSafeInteger(id) || id < 0)) {
        throw new Error("A result has an invalid record identifier.");
    }
    if (!/^\d+$/.test(String(id))) throw new Error("A result has no valid record identifier.");
    return String(id);
}

function compareHistoryIds(left, right) {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
}

function makeHistoryUrl(day, options = {}) {
    const bounds = getDayBounds(day);
    const url = new window.URL(URL);
    url.search = "";
    url.searchParams.set("select", options.latest ? "id" : HISTORY_FIELDS.join(","));
    url.searchParams.set("order", options.latest ? "id.desc" : "id.asc");
    url.searchParams.set("limit", String(options.latest ? 1 : HISTORY_PAGE_SIZE));
    url.searchParams.append("created_at", "gte." + bounds.start);
    url.searchParams.append("created_at", "lt." + bounds.end);
    if (options.afterId !== null && options.afterId !== undefined) {
        url.searchParams.append("id", "gt." + options.afterId);
    }
    if (options.upperId !== null && options.upperId !== undefined) {
        url.searchParams.append("id", "lte." + options.upperId);
    }
    return url.href;
}

async function requestHistoryRows(url, signal) {
    const response = await fetch(url, {
        headers: { apikey: KEY, Authorization: "Bearer " + KEY },
        cache: "no-store", signal
    });
    if (!response.ok) throw new Error(`History request failed: HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
        throw new Error("The database returned an unexpected history format.");
    }
    return rows;
}

async function fetchHistoryRecords(day, signal, afterId = null) {
    // Fix the upper ID first, so new arrivals cannot move the pages mid-download.
    const newest = await requestHistoryRows(makeHistoryUrl(day, { latest: true }), signal);
    if (!newest.length) return { rows: [], latestId: null };
    const latestId = historyRecordId(newest[0]);
    const bounds = getDayBounds(day);
    const rows = [];
    let cursor = afterId;

    while (cursor === null || compareHistoryIds(cursor, latestId) < 0) {
        const page = await requestHistoryRows(makeHistoryUrl(day, { afterId: cursor, upperId: latestId }), signal);
        if (!page.length) break;
        let lastId = cursor;
        for (const row of page) {
            const id = historyRecordId(row);
            if (lastId !== null && compareHistoryIds(id, lastId) <= 0) {
                throw new Error("History records were not returned in a consistent order.");
            }
            if (compareHistoryIds(id, latestId) > 0) throw new Error("History changed during the request.");
            const timestamp = Date.parse(row.created_at);
            if (!Number.isFinite(timestamp)) throw new Error("A result has no valid upload timestamp.");
            if (timestamp >= Date.parse(bounds.start) && timestamp < Date.parse(bounds.end)) rows.push(row);
            lastId = id;
        }
        cursor = lastId;
        // Do not stop on a short page: a server may cap responses below our limit.
    }
    return { rows, latestId };
}

function laneHasHistoryData(run, lane) {
    const identity = ["ID", "Driver", "Class", "Car"].some(field => displayText(run[field + lane]) !== "---");
    const reaction = timingNumber(run["Reaction" + lane]);
    return identity || ["Sixty", "QuartT", "QuartS"].some(field => {
        const value = timingNumber(run[field + lane]);
        return value !== null && value > 0;
    }) || (reaction !== null && reaction !== 0);
}

function historyNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function makeHistoryCell(field, label, value, className = "") {
    const cell = historyNode("td", className);
    cell.dataset.field = field;
    const mobileLabel = historyNode("span", "cell-label", label);
    mobileLabel.setAttribute("aria-hidden", "true");
    cell.append(mobileLabel, historyNode("span", "cell-value", value));
    return cell;
}

function renderHistoryLane(run, lane, result) {
    const red = lane === 1 ? result.lane1RedLight : result.lane2RedLight;
    const total = lane === 1 ? result.lane1Total : result.lane2Total;
    const isWinner = result.winner === lane && !red;
    const hasData = laneHasHistoryData(run, lane);
    const reaction = timingNumber(run["Reaction" + lane]);
    const et = timingNumber(run["QuartT" + lane]);
    const complete = reaction !== null && et !== null && et > 0 && total !== null;
    const row = historyNode("tr", "history-lane" + (red ? " red-light" : isWinner ? " winner" : !complete ? " incomplete" : ""));
    row.dataset.lane = String(lane);

    const laneCell = makeHistoryCell("lane", "Lane", "");
    laneCell.querySelector(".cell-value").append(historyNode("span", "lane-pill", "Lane " + lane));
    const racer = makeHistoryCell("racer", "Racer / class", displayText(run["Driver" + lane]), "racer-cell");
    racer.append(historyNode("span", "racer-class", displayText(run["Class" + lane])));
    const car = displayText(run["Car" + lane]);
    const reactionCell = makeHistoryCell("reaction", "Reaction", displayWithUnit(run["Reaction" + lane], "s"));
    if (red) reactionCell.classList.add("reaction-red");
    const totalCell = makeHistoryCell("total", "Total time", total === null ? "---" : total.toFixed(3) + " s");
    const badge = red ? "RED LIGHT" : isWinner ? "WINNER" : result.winner === "tie" ? "TIE"
        : !hasData ? "NO RESULT" : complete ? "COMPLETE" : "INCOMPLETE";
    const badgeClass = red ? "red-light" : isWinner ? "winner" : result.winner === "tie" ? "tie" : "incomplete";
    totalCell.append(historyNode("span", "result-badge " + badgeClass, badge));
    row.append(laneCell, racer, makeHistoryCell("number", "Race no.", displayText(run["ID" + lane])),
        makeHistoryCell("car", "Make / model", car !== "---" ? car : displayText(run["Make/Model" + lane]), "vehicle-cell"),
        reactionCell, makeHistoryCell("sixty", "60 Ft", displayWithUnit(run["Sixty" + lane], "s")),
        makeHistoryCell("et", "¼-mile ET", displayWithUnit(run["QuartT" + lane], "s")),
        makeHistoryCell("speed", "¼-mile speed", displayWithUnit(run["QuartS" + lane], "km/h")), totalCell);
    return row;
}

function makeHistoryCard(run, number) {
    const id = historyRecordId(run);
    const card = historyNode("section", "run-card");
    card.dataset.recordId = id;
    const header = historyNode("header", "run-header");
    const left = historyNode("div", "run-heading");
    left.append(historyNode("h3", "run-title", "Run " + String(number).padStart(3, "0")),
        historyNode("span", "run-club", displayText(run.Club) === "---" ? "Unspecified club" : displayText(run.Club)));
    const time = historyNode("time", "run-time", new Intl.DateTimeFormat("en-ZA", {
        timeZone: HISTORY_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date(run.created_at)) + " SAST");
    time.dateTime = run.created_at;
    time.title = "Time received by the results database";
    header.append(left, time);
    const wrap = historyNode("div", "history-table-wrap");
    const table = historyNode("table", "history-table");
    table.append(historyNode("caption", "sr-only", `Run ${number}: lane 1 followed by lane 2`));
    const headings = historyNode("tr");
    ["Lane", "Racer / class", "Race no.", "Make / model", "Reaction", "60 Ft", "¼-mile ET", "¼-mile speed", "Total / result"]
        .forEach(label => { const cell = historyNode("th", "", label); cell.scope = "col"; headings.append(cell); });
    const head = historyNode("thead");
    head.append(headings);
    const body = historyNode("tbody");
    const result = determineWinner(run);
    body.append(renderHistoryLane(run, 1, result), renderHistoryLane(run, 2, result));
    table.append(head, body);
    wrap.append(table);
    card.append(header, wrap);
    return card;
}

function historyMatches(run) {
    if (historyState.club && displayText(run.Club) !== historyState.club) return false;
    if (!historyState.search) return true;
    const fields = ["Club", "ID1", "Driver1", "Class1", "Car1", "ID2", "Driver2", "Class2", "Car2"];
    return fields.some(field => displayText(run[field]).toLocaleLowerCase().includes(historyState.search));
}

function renderHistory(preserveScroll = false) {
    const list = document.getElementById("history-list");
    let anchor = null;
    if (preserveScroll && window.scrollY > 300) {
        const visible = Array.from(list.querySelectorAll(".run-card")).find(card => card.getBoundingClientRect().bottom > 100);
        if (visible) anchor = { id: visible.dataset.recordId, top: visible.getBoundingClientRect().top };
    }
    const chronological = [...historyState.rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
        || compareHistoryIds(historyRecordId(a), historyRecordId(b)));
    const numbers = new Map(chronological.map((row, index) => [historyRecordId(row), index + 1]));
    const filtered = chronological.filter(historyMatches);
    const displayed = historyState.order === "newest" ? [...filtered].reverse() : filtered;
    const fragment = document.createDocumentFragment();
    displayed.forEach(row => fragment.append(makeHistoryCard(row, numbers.get(historyRecordId(row)))));
    list.replaceChildren(fragment);

    let lanes = 0;
    let redLights = 0;
    for (const row of filtered) {
        const result = determineWinner(row);
        lanes += Number(laneHasHistoryData(row, 1)) + Number(laneHasHistoryData(row, 2));
        redLights += Number(result.lane1RedLight) + Number(result.lane2RedLight);
    }
    setText("history-run-count", String(filtered.length));
    setText("history-lane-count", String(lanes));
    setText("history-red-count", String(redLights));
    const empty = document.getElementById("history-empty");
    empty.hidden = !historyState.loaded || displayed.length > 0;
    if (!empty.hidden) {
        setText("history-empty-title", historyState.rows.length ? "No matching runs" : "No runs for this day yet");
        setText("history-empty-text", historyState.rows.length
            ? "Try another name, race number, make/model or club. Both lanes stay together when you search."
            : "Results appear here as they reach the database. Choose another event date to view an earlier day.");
    }
    if (anchor) {
        const same = Array.from(list.querySelectorAll(".run-card")).find(card => card.dataset.recordId === anchor.id);
        if (same) window.scrollBy(0, same.getBoundingClientRect().top - anchor.top);
    }
}

function updateHistoryClubs() {
    const select = document.getElementById("history-club");
    const clubs = new Set(historyState.rows.map(row => displayText(row.Club)).filter(value => value !== "---"));
    if (historyState.club) clubs.add(historyState.club);
    const options = [new Option("All clubs / venues", "")];
    Array.from(clubs).sort((a, b) => a.localeCompare(b)).forEach(club => options.push(new Option(club, club)));
    select.replaceChildren(...options);
    select.value = historyState.club;
}

function historyStatus(message, state = "info") {
    const status = document.getElementById("history-status");
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = false;
}

function updateHistoryClock() {
    setText("clock", new Intl.DateTimeFormat("en-ZA", {
        timeZone: HISTORY_TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(new Date()) + " SAST");
}

function updateHistoryDayLabel() {
    const bounds = getDayBounds(historyState.day);
    setText("history-day-label", new Intl.DateTimeFormat("en-ZA", {
        timeZone: HISTORY_TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).format(new Date(bounds.start)));
    const today = getSastDay();
    setText("history-live-label", historyState.day === today ? "Live · updates every 5 seconds" : "Earlier event day · manual refresh");
    document.getElementById("history-date").value = historyState.day;
    document.getElementById("history-date").max = today;
}

async function updateHistory({ forceFull = false } = {}) {
    if (historyState.busy && !forceFull) return;
    if (historyState.controller) historyState.controller.abort();
    const requestId = ++historyState.requestId;
    const day = historyState.day;
    const controller = new AbortController();
    historyState.controller = controller;
    historyState.busy = true;
    document.getElementById("history-refresh").disabled = true;
    const timeout = setTimeout(() => controller.abort(), HISTORY_TIMEOUT_MS);
    const full = forceFull || !historyState.loaded || Date.now() - historyState.lastFullRefresh >= HISTORY_FULL_REFRESH_MS;
    if (!historyState.loaded) historyStatus("Loading this event day's results...");

    try {
        let response = await fetchHistoryRecords(day, controller.signal, full ? null : historyState.latestId);
        let replace = full || response.latestId === null;
        // A removed newest record changes the cursor; rebuild the day's snapshot.
        if (!full && response.latestId !== null && historyState.latestId !== null
            && compareHistoryIds(response.latestId, historyState.latestId) < 0) {
            response = await fetchHistoryRecords(day, controller.signal);
            replace = true;
        }
        if (requestId !== historyState.requestId || day !== historyState.day) return;
        const records = new Map((replace ? [] : historyState.rows).map(row => [historyRecordId(row), row]));
        response.rows.forEach(row => records.set(historyRecordId(row), row));
        const nextRows = Array.from(records.values());
        const changed = JSON.stringify(nextRows) !== JSON.stringify(historyState.rows);
        historyState.rows = nextRows;
        historyState.latestId = response.latestId;
        historyState.loaded = true;
        if (replace) historyState.lastFullRefresh = Date.now();
        updateHistoryClubs();
        if (changed || !document.querySelector(".run-card")) renderHistory(true);
        setText("history-updated", new Intl.DateTimeFormat("en-ZA", {
            timeZone: HISTORY_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
        }).format(new Date()) + " SAST");
        document.getElementById("history-status").hidden = true;
    } catch (error) {
        if (requestId !== historyState.requestId || day !== historyState.day) return;
        historyStatus(historyState.loaded
            ? historyState.day === getSastDay()
                ? "Updates interrupted. Showing the last received history; retrying..."
                : "Updates interrupted. Showing the last received history. Use Refresh to try again."
            : "Unable to load this day's history. Please check your connection and try Refresh.", "error");
        console.error("History update failed:", error);
    } finally {
        clearTimeout(timeout);
        if (requestId === historyState.requestId) {
            historyState.busy = false;
            historyState.controller = null;
            document.getElementById("history-refresh").disabled = false;
        }
    }
}

function setHistoryDay(day, followToday = day === getSastDay()) {
    try {
        getDayBounds(day);
        if (day > getSastDay()) throw new Error("Please choose today or an earlier event date.");
    } catch (error) {
        historyStatus(error.message, "error");
        document.getElementById("history-date").value = historyState.day;
        return Promise.resolve();
    }
    if (historyState.controller) historyState.controller.abort();
    historyState.day = day;
    historyState.followToday = followToday;
    historyState.rows = [];
    historyState.latestId = null;
    historyState.loaded = false;
    historyState.lastFullRefresh = 0;
    setText("history-updated", "---");
    updateHistoryDayLabel();
    updateHistoryClubs();
    renderHistory();
    return updateHistory({ forceFull: true });
}

function pollHistory() {
    const today = getSastDay();
    document.getElementById("history-date").max = today;
    if (historyState.followToday && historyState.day !== today) return setHistoryDay(today, true);
    if (historyState.day === today) return updateHistory();
    return Promise.resolve();
}

function initializeHistory() {
    const params = new window.URLSearchParams(window.location.search);
    historyState.club = params.get("club") || "";
    document.getElementById("history-search").addEventListener("input", event => {
        historyState.search = event.target.value.trim().toLocaleLowerCase();
        renderHistory();
    });
    document.getElementById("history-club").addEventListener("change", event => {
        historyState.club = event.target.value;
        renderHistory();
    });
    document.getElementById("history-order").addEventListener("change", event => {
        historyState.order = event.target.value;
        renderHistory();
    });
    document.getElementById("history-date").addEventListener("change", event => setHistoryDay(event.target.value));
    document.getElementById("history-today").addEventListener("click", () => setHistoryDay(getSastDay(), true));
    document.getElementById("history-refresh").addEventListener("click", () => updateHistory({ forceFull: true }));
    updateHistoryClock();
    setInterval(updateHistoryClock, 1000);
    setHistoryDay(getSastDay(), true);
    setInterval(pollHistory, HISTORY_POLL_MS);
}

initializeHistory();
