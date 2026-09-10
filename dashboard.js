const URL = "https://qgprnewkdzluruihzyhy.supabase.co/rest/v1/raceresults?order=id.desc&limit=2";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncHJuZXdrZHpsdXJ1aWh6eWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjI5MDgsImV4cCI6MjA5NzY5ODkwOH0.WjSnTF80FAABypJuDJfSTvd5_qigr4mJa-TCEsE-4Bc";

function setText(id, value) {
    document.getElementById(id).innerText = value;
}

function ordinalDay(day) {

    if (day >= 11 && day <= 13) {

        return `${day}th`;
    }

    switch (day % 10) {

        case 1:
            return `${day}st`;

        case 2:
            return `${day}nd`;

        case 3:
            return `${day}rd`;

        default:
            return `${day}th`;
    }
}

function updateClock() {

    const now = new Date();

    const weekday =
        now.toLocaleDateString(
            "en-ZA",
            {
                weekday: "long"
            }
        );

    const month =
        now.toLocaleDateString(
            "en-ZA",
            {
                month: "long"
            }
        );

    const year =
        now.getFullYear();

    const day =
        ordinalDay(
            now.getDate()
        );

    const time =
        now.toLocaleTimeString(
            "en-ZA",
            {
                hour12: false
            }
        );

    document.getElementById(
        "clock"
    ).innerText =
        `${weekday}, ${day} ${month} ${year}  ${time}`;
}

function displayWithUnit(value, unit) {
    if (value === null || value === undefined) return "---";
    const text = String(value).trim();
    return text === "" || text === "---" ? "---" : `${text} ${unit}`;
}

function updateLane(prefix, run, laneNumber) {
    const suffix = String(laneNumber);
    setText(prefix + "driver", `Driver: ${run["Driver" + suffix] || "---"} | Class: ${run["Class" + suffix] || "---"} | #\u00A0${run["ID" + suffix] || "---"}`);
    setText(prefix + "car", `Car: ${run["Car" + suffix] || "---"}`);
    setText(prefix + "rt", displayWithUnit(run["Reaction" + suffix], "s"));
    setText(prefix + "60", displayWithUnit(run["Sixty" + suffix], "s"));
    setText(prefix + "4et", displayWithUnit(run["QuartT" + suffix], "s"));
    setText(prefix + "4s", displayWithUnit(run["QuartS" + suffix], "km/h"));
}

async function fetchLiveScores() {
    try {
        const response = await fetch(URL, {
            headers: { "apikey": KEY, "Authorization": "Bearer " + KEY }
        });
        if (!response.ok) throw new Error("Database connection failed");

        const data = await response.json();
        if (data.length === 0) {
            setText("loading", "Connected to database. Waiting for race results...");
            return;
        }

        document.getElementById("loading").style.display = "none";
        document.getElementById("dashboard").style.display = "flex";

        setText("club", (data[0].Club || "---") + " Raceway");
        updateLane("l1-", data[0], 1);
        updateLane("l2-", data[0], 2);

        if (data[1]) {
            updateLane("prev-l1-", data[1], 1);
            updateLane("prev-l2-", data[1], 2);
        }
    } catch (error) {
        setText("loading", "Unable to connect to Supabase database.");
        console.error(error);
    }
}

updateClock();
setInterval(updateClock,1000)
fetchLiveScores();
setInterval(fetchLiveScores, 3000);
