# Use hybrid search for ThaiFCD

Store the ThaiFCD Reference Snapshot in the existing PostgreSQL database and retrieve it with structured food-code lookup, Thai/English lexical matching, and pgvector similarity only as a fallback. We chose this over a vector-only or separate vector database because nutrient facts require normal relational queries, lexical identity guards against semantically plausible false matches, and the existing PostgreSQL deployment already supports pgvector.
