export interface ApiError {
    message: string;
}

export function ok<T>(data: T) {
    return {
        success: true as const,
        data,
    };
}

export function fail(error: string) {
    return {
        success: false as const,
        error,
    };
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;

    if (typeof error === "string") return error;

    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as ApiError).message === "string"
    ) {
        return (error as ApiError).message;
    }

    return "Unknown error";
}
