# Keep nutrition calculation deterministic

For meal observations, probabilistic models interpret uncertain evidence such as visible oil, dryness, and broth consumption, while deterministic domain logic applies portion-weight constraints, ThaiFCD reference baselines, distribution shifts, and plausible-range calculations. We chose this boundary over model-generated arithmetic because it keeps estimates reproducible and testable; fine-tuning remains deferred until real corrections and a held-out evaluation set demonstrate that prompting and explicit rules are insufficient.
