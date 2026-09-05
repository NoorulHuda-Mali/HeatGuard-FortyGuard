# HeatGuard

**Turning hourly weather data into a heat-safety decision for construction crews.**

HeatGuard watches temperature and humidity at a job site, decides when heat risk is rising, and tells a supervisor what to do about it — before conditions peak, not after. Built for **262 Fifth Avenue, New York, NY** as a hackathon prototype.

🔗 **Live demo:** `<add your GitHub Pages link here after deploying>`
🎥 **Demo video:** [https://youtu.be/1yYEFdek7EY](https://youtu.be/1yYEFdek7EY)

---

## The problem

Heat is the leading weather-related cause of death for outdoor workers in the US, and most job sites still make heat-safety calls off a phone weather app and gut feel. A single hourly temperature reading doesn't tell a supervisor what they actually need to know: *is this about to get worse, and what should I change in the next hour?*

## The idea

Don't just display the weather — interpret it. HeatGuard is built around a simple loop:

```
MONITOR → ANALYZE → ACT
```

1. **Monitor** — pull hourly temperature, humidity, and a computed heat-risk score/level for the site.
2. **Analyze** — a rules-based agent watches the sequence of hours, not just the current one, and asks: is risk rising, about to rise, staying dangerously high, or easing off?
3. **Act** — every time the answer to one of those questions changes, the agent produces one plain-English recommendation a supervisor can actually use (shift tasks, add breaks, suspend work, stand down).

The agent deliberately does **not** narrate every hour. A dashboard that says something new every hour whether or not anything changed trains people to stop reading it. HeatGuard only speaks when it's worth hearing.

## What makes it an *agent* and not just a dashboard

The core differentiator is the **lead-time warning**. At every hour, the logic looks 3 hours ahead. If risk is projected to cross into a more dangerous band before it's actually there yet, it warns *now* — with a concrete lead time ("reaches Moderate in ~3h") and a specific suggested schedule shift ("move outdoor tasks before 8am or after 5pm"), computed by scanning outward from the danger window to the nearest genuinely safe hours on either side.

Beyond that, it tracks:
- **Escalation** — risk just got worse than the hour before.
- **Sustained risk** — a reminder if a dangerous level (Major+) persists for 2+ hours straight, so the alert feed doesn't spam every single hour.
- **All-clear** — risk dropped back down, safe to resume normal scheduling.
- **Daily status** — if none of the above ever fires (a calm day), it still says so once. A silent agent and a broken one look identical from the outside, so it always reports *something*.

## Risk scale

| Level | Color | Recommended action |
|---|---|---|
| None | Green | No special precautions. Normal schedule. |
| Low | Yellow | Keep water stations stocked, continue as normal. |
| Moderate | Orange | Increase break frequency, shaded/indoor breaks, reinforce hydration. |
| Major | Red | Reschedule strenuous tasks to cooler hours, mandatory shaded breaks every hour. |
| Extreme | Magenta | Suspend non-essential outdoor work, activate emergency heat protocol. |

## What's in this repo

| File | What it is |
|---|---|
| `HeatGuard_Landing.html` | Marketing/front page — explains the problem and links to the dashboard. |
| `HeatGuard_Dashboard.html` | The actual product — live risk timeline, temperature chart, current conditions, and the agent's alert feed. Includes three data modes (see below). |
| `heatRiskAgent.js` | The agent logic as a standalone, dependency-free JS module — the reference implementation for wiring into a real backend. |
| `weather_data.json` / `weather_data_2.json` | Real hourly site data used to drive the demo. |

> **Note:** `HeatGuard_Dashboard.html` contains its own compact inlined copy of the agent logic so it works as a single self-contained file for the demo. `heatRiskAgent.js` is the canonical version intended for real integration. Worth consolidating into one source of truth (`<script src="heatRiskAgent.js">`) before this goes past prototype stage.

## The three data modes in the dashboard

1. **Site · Aug 30** — real feed for 262 Fifth Ave. Risk stays Low all day; the agent correctly stays quiet and only reports the calm status once.
2. **NYC heat day · Aug 7** — real site data from the hottest day of August 2026 (peak 35.2°C / 95.4°F, risk score up to 56/Moderate). Shows the full escalation → advance-warning → all-clear sequence on genuine data.
3. **Extreme scenario** — a synthetic day included so the full alert range (Major/Extreme, the sustained-risk reminder) is visible in one place, since neither real day reaches that far. Clearly labeled as synthetic in the UI.

## How the risk score is calculated

FortyGuard's API (the sponsor API this was built against) provides raw environmental layers — temperature, humidity, solar/heat-index parameters — but does not compute a risk classification itself. That layer is built on top, using a heat-index style formula (temperature + humidity → apparent temperature), banded into the five levels above, in the same spirit as the National Weather Service's HeatRisk scale.

## Running it locally

The dashboard is a single static HTML file with everything inlined — no build step, no server required to view it. That said, opening `HeatGuard_Landing.html` directly as a `file://` path means its link to the dashboard may not resolve depending on your browser/setup. Easiest fix:

1. Open the project folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `HeatGuard_Landing.html` → "Open with Live Server."

Or just deploy it (see below) and always view it over `https://`.

## Deploying

This repo is plain static HTML/CSS/JS, so **GitHub Pages** works with zero configuration:

1. Push this repo to GitHub.
2. Repo → Settings → Pages → Source: "Deploy from a branch" → `main` / `/ (root)` → Save.
3. Your site is live at `https://<username>.github.io/<repo-name>/HeatGuard_Landing.html` within a minute or two.

## Disclaimer

This is a hackathon prototype. It is not a certified occupational safety tool and should not be used as the sole basis for real workplace heat-safety decisions. Always follow official OSHA/NWS heat-safety guidance and your organization's actual safety protocols.

## Team

**HeatGuard** — FortyGuard Hackathon '26

| Person | Role |
|---|---|
| Noor-ul-huda | Data feed |
| Syeda Sara Shah | Reasoning agent |
| Aisha Paras | Site dashboard |

See [`TEAM.md`](./TEAM.md) for a full breakdown of what each person built.

## Acknowledgments

- [FortyGuard](https://github.com/FortyGuard-Tech/temperature-api-quickstart) — environmental data API this prototype is built around.
- NWS HeatRisk scale — inspiration for the five-level risk banding.
