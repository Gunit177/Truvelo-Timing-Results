const URL = "https://qgprnewkdzluruihzyhy.supabase.co/rest/v1/raceresults?order=id.desc&limit=2";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncHJuZXdrZHpsdXJ1aWh6eWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjI5MDgsImV4cCI6MjA5NzY5ODkwOH0.WjSnTF80FAABypJuDJfSTvd5_qigr4mJa-TCEsE-4Bc";

// The existing Supabase URL and public key are restored above this comment.
const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 10000;
let fetchInProgress = false;
let hasRaceData = false;

function setText(id, value) {
    document.getElementById(id).textContent = value;
}

function displayText(value) {
    if (value === null || value === undefined) return "---";
    const text = String(value).trim();
    return text === "" ? "---" : text;
}

function ordinalDay(day) {
    if (day >= 11 && day <= 13) return `${day}th`;
    const suffix = { 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th";
    return `${day}${suffix}`;
}

function updateClock() {
    const now = new Date();
    const weekday = now.toLocaleDateString("en-ZA", { weekday: "long" });
    const month = now.toLocaleDateString("en-ZA", { month: "long" });
    const time = now.toLocaleTimeString("en-ZA", { hour12: false });
    setText("clock", `${weekday}, ${ordinalDay(now.getDate())} ${month} ${now.getFullYear()}  ${time}`);
}

function timingNumber(value) {
    const text = displayText(value);
    if (text === "---") return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

function calculateTotalTime(reaction, quarterEt) {
    const rt = timingNumber(reaction);
    const et = timingNumber(quarterEt);
    if (rt === null || et === null) return null;
    const total = rt + et;
    return Number.isFinite(total) ? total : null;
}

function determineWinner(run) {
    const lane1Total = calculateTotalTime(run.Reaction1, run.QuartT1);
    const lane2Total = calculateTotalTime(run.Reaction2, run.QuartT2);
    const lane1Reaction = timingNumber(run.Reaction1);
    const lane2Reaction = timingNumber(run.Reaction2);
    const lane1Et = timingNumber(run.QuartT1);
    const lane2Et = timingNumber(run.QuartT2);
    const lane1RedLight = lane1Reaction !== null && lane1Reaction < 0;
    const lane2RedLight = lane2Reaction !== null && lane2Reaction < 0;
    const lane1Eligible = lane1Reaction !== null && lane1Reaction >= 0
        && lane1Et !== null && lane1Et > 0 && lane1Total !== null;
    const lane2Eligible = lane2Reaction !== null && lane2Reaction >= 0
        && lane2Et !== null && lane2Et > 0 && lane2Total !== null;
    let winner = null;

    // A negative reaction marks that lane as a red light, regardless of its ET.
    // The other lane must have a valid completed result before it can win.
    if (lane1RedLight && lane2Eligible) {
        winner = 2;
    } else if (lane2RedLight && lane1Eligible) {
        winner = 1;
    } else if (lane1Eligible && lane2Eligible) {
        // Compare clean runs at the same precision as the displayed totals.
        const l1 = Number(lane1Total.toFixed(3));
        const l2 = Number(lane2Total.toFixed(3));
        winner = l1 < l2 ? 1 : l2 < l1 ? 2 : "tie";
    }

    return { lane1Total, lane2Total, lane1RedLight, lane2RedLight, winner };
}

function displayWithUnit(value, unit) {
    const text = displayText(value);
    return text === "---" ? "---" : `${text} ${unit}`;
}

function updateLane(prefix, run, laneNumber, raceResult, panelId, winnerId) {
    const suffix = String(laneNumber);
    setText(prefix + "driver", `Driver: ${displayText(run["Driver" + suffix])} | Class: ${displayText(run["Class" + suffix])} | #\u00A0${displayText(run["ID" + suffix])}`);

    // Car1/Car2 are database fields; Make/Model is only the visible label.
    const car = displayText(run["Car" + suffix]);
    const vehicle = car !== "---" ? car : displayText(run["Make/Model" + suffix]);
    setText(prefix + "car", `Make/Model: ${vehicle}`);
    setText(prefix + "rt", displayWithUnit(run["Reaction" + suffix], "s"));
    setText(prefix + "60", displayWithUnit(run["Sixty" + suffix], "s"));
    setText(prefix + "4et", displayWithUnit(run["QuartT" + suffix], "s"));
    setText(prefix + "4s", displayWithUnit(run["QuartS" + suffix], "km/h"));

    const total = laneNumber === 1 ? raceResult.lane1Total : raceResult.lane2Total;
    setText(prefix + "total", total === null ? "---" : `${total.toFixed(3)} s`);

    const isRedLight = laneNumber === 1 ? raceResult.lane1RedLight : raceResult.lane2RedLight;
    const isWinner = !isRedLight && raceResult.winner === laneNumber;
    document.getElementById(panelId).classList.toggle("winner", isWinner);
    document.getElementById(panelId).classList.toggle("red-light", isRedLight);
    document.getElementById(winnerId).classList.toggle("active", isWinner || isRedLight);
    document.getElementById(winnerId).classList.toggle("red-light", isRedLight);
    document.getElementById(prefix + "rt").classList.toggle("red-light", isRedLight);
    setText(winnerId, isRedLight ? "RED LIGHT" : isWinner ? "WINNER" : "");
}

function renderRace(run, previous = false) {
    const prefix = previous ? "prev-" : "";
    const data = run || {};
    const result = determineWinner(data);
    updateLane(prefix + "l1-", data, 1, result, prefix + "l1-panel", prefix + "l1-winner");
    updateLane(prefix + "l2-", data, 2, result, prefix + "l2-panel", prefix + "l2-winner");
}

function showStatus(message, state = "info") {
    const status = document.getElementById("loading");
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = false;
}

function showResults(data) {
    if (data.length === 0) {
        renderRace(null);
        renderRace(null, true);
        setText("club", "");
        document.getElementById("dashboard").hidden = true;
        document.getElementById("previous-dashboard").hidden = true;
        hasRaceData = false;
        showStatus("Connected to database. Waiting for race results...");
        return;
    }

    setText("club", displayText(data[0].Club));
    renderRace(data[0]);
    // An absent second result must clear the old previous race and its highlights.
    renderRace(data[1] || null, true);
    document.getElementById("dashboard").hidden = false;
    document.getElementById("previous-dashboard").hidden = false;
    hasRaceData = true;
    document.getElementById("loading").hidden = true;
}

async function fetchLiveScores() {
    // A slow request must finish or time out before another request can start.
    if (fetchInProgress) return;
    fetchInProgress = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        let data;
        try {
            const response = await fetch(URL, {
                headers: { apikey: KEY, Authorization: "Bearer " + KEY },
                signal: controller.signal,
                cache: "no-store"
            });
            if (!response.ok) throw new Error(`Database request failed: HTTP ${response.status}`);
            data = await response.json();
            if (!Array.isArray(data) || data.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
                throw new Error("The database returned an unexpected results format.");
            }
        } catch (error) {
            showStatus(hasRaceData
                ? "Connection lost. Showing the last received results; retrying..."
                : "Unable to load race results from the database. Retrying...", "error");
            console.error("Race results request failed:", error);
            return;
        }

        try {
            showResults(data);
        } catch (error) {
            showStatus("Results received, but the dashboard could not display them. Please reload the page.", "error");
            console.error("Race results display failed:", error);
        }
    } finally {
        clearTimeout(timeoutId);
        fetchInProgress = false;
    }
}

updateClock();
setInterval(updateClock, 1000);
fetchLiveScores();
setInterval(fetchLiveScores, POLL_INTERVAL_MS);
