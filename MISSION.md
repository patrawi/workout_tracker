# Mission: Nutrition uncertainty computation

## Why
Choose an uncertainty method that makes meal estimates honest and explainable without wasting model calls or server resources.

## Success looks like
- Explain what Monte Carlo propagates and what it cannot improve
- Choose deterministic scenarios for V1 and recognize when simulation becomes justified
- Keep AI inference separate from local numerical computation

## Constraints
- V1 has uncalibrated recipe priors and reports plausible ranges
- Logging must remain fast and API-efficient

## Out of scope
- A general statistics course
- Implementing the estimator during the current design interview
