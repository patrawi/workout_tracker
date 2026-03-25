/**
 * Format a date string (YYYY-MM-DD) into "Mon DD" format
 */
export function formatDate(dateStr: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    }).format(new Date(dateStr + "Z"));
}

/**
 * Format a date string (YYYY-MM-DD or ISO) into "Mon DD, HH:MM" format
 */
export function formatDateTime(dateStr: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(dateStr + "Z"));
}

/**
 * Format a date string for full display in tooltip (e.g., "Monday, March 17, 2025")
 */
export function formatDateLabel(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

/**
 * Format a date for full display (e.g., "Monday, March 17, 2025")
 */
export function formatFullDate(dateStr: string): string {
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(new Date(dateStr + "T00:00:00"));
}

/**
 * Format a date with weekday, month, day, year, hour, minute
 */
export function formatEditModalDate(dateStr: string): string {
    return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(dateStr + "Z"));
}

/**
 * Get the local date string in YYYY-MM-DD format
 */
export function getLocalDateStr(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
}

/**
 * Format date for history page (weekday, month day, year)
 */
export function formatHistoryDate(dateStr: string): string {
    const date = new Date(dateStr + "T00:00:00");
    return new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(date);
}
