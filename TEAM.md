# Team — HeatGuard

**FortyGuard Hackathon '26**

HeatGuard is built as one pipeline in three pieces: a data feed, a reasoning agent, and the dashboard that puts it in front of a supervisor. Each team member owned one piece end to end.

```
Data feed  →  Reasoning agent  →  Site dashboard
(Noor-ul-huda)   (Syeda Sara Shah)   (Aisha Paras)
```

---

## Noor-ul-huda — Data Feed

Sources and serves the hourly weather and risk-score data that each site's dashboard reads from.

- Pulled hourly temperature and humidity for the project site (262 Fifth Avenue, New York, NY).
- Computed a per-hour heat-risk score and risk level from that raw weather data.
- Defined the data contract (`time`, `temp`, `humidity`, `risk_score`, `risk_level`) that the rest of the pipeline builds on.

## Syeda Sara Shah — Reasoning Agent

Wrote the rules engine that turns raw hourly numbers into decisions.

- Built the agent logic that watches the hourly feed and detects: risk escalation, sustained high-risk periods, advance warnings ahead of a projected spike, and all-clear conditions once risk eases.
- Attached a concrete, actionable recommendation to every alert (e.g. shift outdoor tasks, increase breaks, suspend work) rather than just reporting a number.
- Designed the agent to only speak when something actually changes, so the alert feed stays useful instead of noisy.

## Aisha Paras — Site Dashboard

Built the frontend that puts the agent's output in front of a supervisor.

- Built the work-suitability status view, the 24-hour risk timeline, and the live agent log.
- Added multi-site support and natural-language rephrasing of alerts for a more human-readable feed.
- Designed the overall look and feel of the landing page and dashboard.

---

## Why this split

Each person owned a full slice of the pipeline rather than a horizontal layer (e.g. "frontend" vs. "backend"), so every stage — from raw data, to the decision logic, to what a supervisor actually sees — had one clear owner end to end.
