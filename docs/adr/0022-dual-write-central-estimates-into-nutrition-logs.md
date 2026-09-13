# Dual-write central estimates into nutrition logs

The new estimate tables are the source of truth for ranges and provenance. When the user confirms an estimate, its central values are also written as a point-estimate row in the existing nutrition_logs with a provenance marker so current analytics keep working unchanged, and a confirmed Nutrition Estimate Revision updates the linked row. We chose dual-write over having analytics read two tables or splitting nutrition history because it preserves one daily-total surface while keeping full range evidence in the new storage.
