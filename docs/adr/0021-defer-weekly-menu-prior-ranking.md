# Defer weekly menu prior ranking out of V1

V1 does not consume the Weekly Menu Prior for ranking; retrieval ranks from the user's menu name and catalog evidence alone, and a day-by-day menu photo is attached as optional label_or_menu image evidence that the VLM may read. We chose deferral over building a weekly menu ingestion pipeline because the user will photograph menus daily anyway, so a parsing pipeline adds upkeep without changing V1 matching; this defers ADR 0003's prior without rejecting its soft-prior boundary for the future.
