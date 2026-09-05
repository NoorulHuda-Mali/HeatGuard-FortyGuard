/**
 * heatRiskAgent.js
 * ------------------------------------------------------------------
 * Person B — Agent / Reasoning Layer
 * Site: 262 Fifth Avenue, New York, NY (construction site)
 *
 * INPUT  : hourly records from Person A's Temperature/Risk API, shape:
 *          { time: ISOString, temp: number, humidity: number,
 *            risk_score: number, risk_level: string }
 *
 * OUTPUT : an ordered list of "alerts" — the things the agent decided
 *          were worth telling a human about, each with a concrete,
 *          actionable recommendation. This is deliberately NOT "show
 *          every hour's number" — it only speaks when something
 *          changes, is about to change, or has been bad for a while.
 *          That's the difference between this and a dashboard.
 *
 * No external dependencies. Works in Node and in the browser as-is.
 * ------------------------------------------------------------------
 */

// ---- 1. Risk-level vocabulary -------------------------------------
// We trust Person A's `risk_level` string as the source of truth (their
// scoring formula may change), but we still need to rank levels to
// detect "did it get worse". This ranking is deliberately generous
// with synonyms since sponsor APIs / NWS-style scales don't all use
// identical words.
const LEVEL_RANK = {
  none: 0,
  safe: 0,
  low: 1,
  minor: 1,
  moderate: 2,
  major: 3,
  high: 3,
  extreme: 4,
  severe: 4,
  critical: 4,
};

function rankOf(riskLevel) {
  const key = String(riskLevel || "").trim().toLowerCase();
  if (key in LEVEL_RANK) return LEVEL_RANK[key];
  // Unknown label from Person A's API — fail safe, treat as "moderate"
  // so an unrecognized-but-possibly-serious label still gets surfaced
  // rather than silently ignored.
  return 2;
}

// ---- 2. Recommendation copy per level ------------------------------
// Rules-based, no ML — this is the "safest for a hackathon" approach
// the plan calls for. Each entry is a short, supervisor-facing action.
const RECOMMENDATIONS = {
  0: "No special precautions needed. Normal schedule.",
  1: "Low risk. Keep water stations stocked and continue normal schedule.",
  2: "Increase break frequency, move breaks to shaded/indoor areas, and start reminding crews to hydrate.",
  3: "Reschedule strenuous outdoor tasks to cooler hours. Mandatory shaded breaks every hour. Increase hydration checks and watch for early heat-illness symptoms.",
  4: "Suspend non-essential outdoor work. Move remaining tasks to early morning or evening. Activate the site's emergency heat protocol and station someone to monitor crews.",
};

const LEVEL_LABEL = ["None", "Low", "Moderate", "Major", "Extreme"];

// ---- 3. Core agent loop --------------------------------------------
/**
 * @param {Array} hourly - Person A's hourly records, in chronological order
 * @param {Object} [config]
 * @param {number} [config.lookaheadHours=3]  how far ahead the agent peeks
 * @param {number} [config.warnRank=2]        min rank ("Moderate") worth an advance warning
 * @param {number} [config.sustainedHours=2]  consecutive hours at Major+ before a reminder fires
 * @returns {Array} alerts, chronological, each:
 *   { time, type, risk_level, risk_score, rank, lead_time_hours, message }
 */
function runAgent(hourly, config = {}) {
  const lookaheadHours = config.lookaheadHours ?? 3;
  const warnRank = config.warnRank ?? 2; // Moderate
  const sustainedHours = config.sustainedHours ?? 2;

  if (!Array.isArray(hourly) || hourly.length === 0) return [];

  const ranks = hourly.map((h) => rankOf(h.risk_level));
  const alerts = [];
  const alreadyWarnedIndex = new Set(); // avoid duplicate lookahead warnings for the same peak

  let priorRank = ranks[0];
  let sustainedCount = 0;
  let peakSoFar = { rank: ranks[0], score: hourly[0].risk_score, index: 0 };

  for (let i = 0; i < hourly.length; i++) {
    const row = hourly[i];
    const rank = ranks[i];

    // --- (a) Escalation: risk just got worse than the previous hour
    if (i > 0 && rank > priorRank) {
      alerts.push(makeAlert(row, rank, "escalation",
        `Risk rising to ${LEVEL_LABEL[rank]} (score ${row.risk_score}) at ${fmtTime(row.time)}. ${RECOMMENDATIONS[rank]}`));
    }

    // --- (b) De-escalation / all-clear: dropped back after being elevated
    if (i > 0 && rank < priorRank && priorRank >= 2 && rank <= 1) {
      alerts.push(makeAlert(row, rank, "all_clear",
        `Risk easing back to ${LEVEL_LABEL[rank]} as of ${fmtTime(row.time)}. Normal schedule can resume.`));
    }

    // --- (c) Advance / lead-time warning — the "proactive" part.
    // Look ahead up to `lookaheadHours`; if a future hour crosses into
    // warnRank+ and today's current hour hasn't, warn now with lead time,
    // and suggest a concrete before/after window using the surrounding data.
    if (rank < warnRank) {
      for (let j = i + 1; j <= Math.min(i + lookaheadHours, hourly.length - 1); j++) {
        if (ranks[j] >= warnRank && !alreadyWarnedIndex.has(j)) {
          const leadHours = j - i;
          const window = findSafeWindow(hourly, ranks, j, warnRank);
          alerts.push(makeAlert(row, ranks[j], "advance_warning",
            `Heads up: risk is projected to reach ${LEVEL_LABEL[ranks[j]]} by ${fmtTime(hourly[j].time)} ` +
            `(in ~${leadHours}h). Recommend shifting outdoor tasks to before ${window.before} or after ${window.after}.`,
            leadHours));
          alreadyWarnedIndex.add(j);
          break; // one advance warning per emerging peak is enough
        }
      }
    }

    // --- (d) Sustained high-risk reminder
    if (rank >= 3) {
      sustainedCount += 1;
      if (sustainedCount === sustainedHours) {
        alerts.push(makeAlert(row, rank, "sustained",
          `Risk has stayed at ${LEVEL_LABEL[rank]} for ${sustainedHours}+ hours as of ${fmtTime(row.time)}. Confirm crews have moved to the mitigation plan.`));
      }
    } else {
      sustainedCount = 0;
    }

    if (rank > peakSoFar.rank || (rank === peakSoFar.rank && row.risk_score > peakSoFar.score)) {
      peakSoFar = { rank, score: row.risk_score, index: i };
    }
    priorRank = rank;
  }

  // --- (e) Daily summary if nothing noteworthy ever happened.
  // A silent agent is indistinguishable from a broken one — always
  // report status once, even when the answer is "you're fine".
  if (alerts.length === 0) {
    const peak = hourly[peakSoFar.index];
    alerts.push(makeAlert(hourly[0], peakSoFar.rank, "status",
      `Agent monitoring engaged for the day. Forecast stays in the ${LEVEL_LABEL[peakSoFar.rank]} band throughout ` +
      `(peak score ${peak.risk_score} around ${fmtTime(peak.time)}). No schedule changes required — continue routine hydration checks.`));
  }

  return alerts;
}

function makeAlert(row, rank, type, message, leadHours = 0) {
  return {
    time: row.time,
    type,
    risk_level: LEVEL_LABEL[rank],
    risk_score: row.risk_score,
    rank,
    lead_time_hours: leadHours,
    message,
  };
}

// Finds the last "safe" (< warnRank) hour before the elevated block, and
// the first "safe" hour after it, so recommendations can name concrete
// times: "shift tasks to before Xam or after Ypm" — matching the plan.
function findSafeWindow(hourly, ranks, elevatedIndex, warnRank) {
  let before = elevatedIndex;
  while (before > 0 && ranks[before] >= warnRank) before--;
  let after = elevatedIndex;
  while (after < hourly.length - 1 && ranks[after] >= warnRank) after++;
  return {
    before: fmtTime(hourly[before].time),
    after: fmtTime(hourly[after].time),
  };
}

function fmtTime(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}${m ? ":" + String(m).padStart(2, "0") : ""}${ampm}`;
}

// ---- 4. Optional: natural-language phrasing via an LLM call --------
// Rules-based logic above decides WHEN and WHAT; this step only makes
// the wording feel like a person wrote it. Purely cosmetic — the agent
// works fully without it (this is the "optional" step from the plan).
// `caller` is injected so this file works both in a browser artifact
// (fetch to /v1/messages) and in Node (pass your own API caller).
async function phraseAlertWithLLM(alert, caller) {
  const prompt =
    `Rephrase this construction-site heat-safety alert in one warm, ` +
    `direct sentence a site supervisor would read on their phone. ` +
    `Keep every number and time exactly as given. Do not add new facts.\n\n` +
    `Alert: ${alert.message}`;
  const text = await caller(prompt);
  return { ...alert, message_natural: text.trim() };
}

// ---- 5. Sample data for demos / tests --------------------------------
// SAMPLE_HOT_DAY_NYC is NOT synthetic noise — it's anchored to two
// verified real records for New York City, August 7, 2026 (the hottest
// day of the month): a max temperature of 91°F / 32.8°C, and a dew
// point of 79°F / 26°C (one degree off the all-time NYC record) amid
// a regional heat dome (source: weatherandclimate.info KNYC station
// data; Wikipedia "2026 North American heat wave"). Exact hour-by-hour
// official readings aren't published, so the 24 hourly points here are
// interpolated between those two anchors using a standard humid
// heat-wave diurnal shape, then scored with the NIST/NWS Rothfusz heat
// index regression and bucketed into NWS-style heat-index categories
// (<80F None, 80-90 Low, 90-103 Moderate, 103-124 Major, 124+ Extreme).
// Swap this for a live FortyGuard-backed feed once Person A wires one up.
const SAMPLE_HOT_DAY_NYC = [
  { time: "2026-08-07T00:00", temp: 26.1, humidity: 88, risk_score: 79, risk_level: "None" },
  { time: "2026-08-07T01:00", temp: 25.6, humidity: 90, risk_score: 78, risk_level: "None" },
  { time: "2026-08-07T02:00", temp: 25.6, humidity: 92, risk_score: 78, risk_level: "None" },
  { time: "2026-08-07T03:00", temp: 25.0, humidity: 94, risk_score: 77, risk_level: "None" },
  { time: "2026-08-07T04:00", temp: 24.4, humidity: 95, risk_score: 76, risk_level: "None" },
  { time: "2026-08-07T05:00", temp: 24.4, humidity: 95, risk_score: 76, risk_level: "None" },
  { time: "2026-08-07T06:00", temp: 24.4, humidity: 93, risk_score: 76, risk_level: "None" },
  { time: "2026-08-07T07:00", temp: 25.0, humidity: 90, risk_score: 77, risk_level: "None" },
  { time: "2026-08-07T08:00", temp: 26.1, humidity: 84, risk_score: 79, risk_level: "None" },
  { time: "2026-08-07T09:00", temp: 27.8, humidity: 76, risk_score: 88, risk_level: "Low" },
  { time: "2026-08-07T10:00", temp: 29.4, humidity: 68, risk_score: 92, risk_level: "Moderate" },
  { time: "2026-08-07T11:00", temp: 30.6, humidity: 62, risk_score: 94, risk_level: "Moderate" },
  { time: "2026-08-07T12:00", temp: 31.7, humidity: 58, risk_score: 96, risk_level: "Moderate" },
  { time: "2026-08-07T13:00", temp: 31.7, humidity: 56, risk_score: 95, risk_level: "Moderate" },
  { time: "2026-08-07T14:00", temp: 32.2, humidity: 55, risk_score: 97, risk_level: "Moderate" },
  { time: "2026-08-07T15:00", temp: 32.8, humidity: 54, risk_score: 99, risk_level: "Moderate" }, // 91F peak, verified
  { time: "2026-08-07T16:00", temp: 32.2, humidity: 56, risk_score: 98, risk_level: "Moderate" },
  { time: "2026-08-07T17:00", temp: 31.1, humidity: 60, risk_score: 95, risk_level: "Moderate" },
  { time: "2026-08-07T18:00", temp: 30.0, humidity: 66, risk_score: 93, risk_level: "Moderate" },
  { time: "2026-08-07T19:00", temp: 28.9, humidity: 74, risk_score: 92, risk_level: "Moderate" },
  { time: "2026-08-07T20:00", temp: 27.8, humidity: 82, risk_score: 89, risk_level: "Low" },
  { time: "2026-08-07T21:00", temp: 27.2, humidity: 89, risk_score: 89, risk_level: "Low" },
  { time: "2026-08-07T22:00", temp: 26.7, humidity: 97, risk_score: 88, risk_level: "Low" }, // 79F dew point, verified
  { time: "2026-08-07T23:00", temp: 26.1, humidity: 90, risk_score: 79, risk_level: "None" },
];

module.exports = {
  runAgent,
  phraseAlertWithLLM,
  rankOf,
  LEVEL_LABEL,
  RECOMMENDATIONS,
  SAMPLE_HOT_DAY_NYC,
};
