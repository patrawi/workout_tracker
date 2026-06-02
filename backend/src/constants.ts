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

// AI Coach (conversational — higher temperature than the parsers)
export const COACH_MODEL = "gemini-3-flash-preview";
export const COACH_TEMPERATURE = 0.6;
export const COACH_CONTEXT_DAYS = 14; // window for the grounding summary
export const COACH_NUTRITION_DAYS = 7; // days of nutrition to average

// DeepSeek (OpenAI-compatible REST). Selected via LLM_PROVIDER=deepseek + DEEPSEEK_API_KEY.
// Coach runs thinking mode ON (plan reasoning); parsers run thinking OFF.
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_COACH_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_PARSER_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_TEMPERATURE = 0.1;

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
