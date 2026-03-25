/**
 * Calculate BMI from weight (kg) and height (cm)
 */
export function calculateBMI(weightKg: number, heightCm: number): number {
    if (heightCm <= 0 || weightKg <= 0) return 0;
    return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

/**
 * Get BMI category label
 */
export function getBMILabel(bmi: number): string {
    if (bmi === 0) return "";
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Normal";
    if (bmi < 30) return "Overweight";
    return "Obese";
}

/**
 * Get BMI category color class
 */
export function getBMIColorClass(bmi: number): string {
    if (bmi === 0) return "";
    if (bmi < 18.5 || bmi >= 25) {
        return bmi >= 30 ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400";
    }
    return "bg-accent-500/10 text-accent-400";
}
