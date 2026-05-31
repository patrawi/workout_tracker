// src/constants.ts

// Pagination & Limits
export const DEFAULT_WORKOUT_LIMIT = 20;
export const DEFAULT_RECENT_NOTES_LIMIT = 5;

// Time Windows (in days)
export const ANALYTICS_DEFAULT_DAYS_BACK = 7;
export const ANALYTICS_DEFAULT_DAYS_BACK_FOR_EXERCISE = 0;
export const BODYWEIGHT_DEFAULT_DAYS_BACK = 0;
export const HEATMAP_LOOKBACK_DAYS = 365;

// Auth
export const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 86400; // 7 days
export const AUTH_JWT_EXPIRY = "7d";

// AI Models
export const GEMINI_MODEL_WORKOUT = "gemini-3-flash-preview";
export const GEMINI_MODEL_NUTRITION = "gemini-3-flash-preview";
export const GEMINI_TEMPERATURE = 0.1;

// Food Catalog — embeddings + retrieval (RAG nutrition parse)
export const GEMINI_MODEL_EMBEDDING = "gemini-embedding-001"; // free tier; dim requested below
export const EMBEDDING_DIM = 768; // gemini-embedding-001 defaults to 3072 — we request 768
export const CATALOG_TOPK = 3; // candidates per item
export const CATALOG_UNCERTAIN_DISTANCE = 0.5; // cosine distance above this → flag uncertain

// Database
export const PROFILE_DEFAULT_ID = 1;

// API Defaults (for ?? fallbacks)
export const DEFAULT_EXERCISE_NAME = "Unknown Exercise";
export const DEFAULT_MUSCLE_GROUP = "Other";
export const DEFAULT_EMPTY_STRING = "";
export const DEFAULT_NUMBER = 0;
export const DEFAULT_BOOLEAN_FALSE = false;
export const DEFAULT_TAGS: string[] = [];

// Static Assets
export const STATIC_ASSETS_PREFIX = "/assets";
export const STATIC_FILES_PATTERN =
  /\.(js|css|ico|png|jpg|svg|woff|woff2|ttf|eot)$/;
