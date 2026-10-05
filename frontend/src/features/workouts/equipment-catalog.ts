// Gym Profile equipment vocabulary (ADR 0027): curated RepDB equipment types
// covering every logged name and saved-plan exercise of the owner. Values are
// stored verbatim (canonical_exercises.equipment); labels are display-only.
export interface EquipmentGroup {
    key: string;
    label: string;
    items: Array<{ value: string; label: string }>;
}

export const EQUIPMENT_GROUPS: EquipmentGroup[] = [
    {
        key: "free",
        label: "ฟรีเวท",
        items: [
            { value: "dumbbell", label: "ดัมเบิล" },
            { value: "barbell", label: "บาร์เบล" },
            { value: "ez_bar", label: "EZ บาร์" },
            { value: "kettlebell", label: "เคตเติลเบล" },
            { value: "cable", label: "เคเบิล" },
        ],
    },
    {
        key: "station",
        label: "สเตชัน",
        items: [
            { value: "pull_up_bar", label: "แถนพัก" },
            { value: "dip_station", label: "แถนดิ้ม" },
            { value: "flat_bench", label: "ม้านั่ง" },
            { value: "smith_machine", label: "เครื่องสมิธ" },
            { value: "assisted_pullup_machine", label: "เครื่องช่วยพัก" },
        ],
    },
    {
        key: "machine",
        label: "เครื่อง",
        items: [
            { value: "chest_press_machine", label: "Chest Press" },
            { value: "shoulder_press_machine", label: "Shoulder Press" },
            { value: "lat_pulldown_machine", label: "Lat Pulldown" },
            { value: "chest_fly_machine", label: "ปีกตัว (Chest Fly)" },
            { value: "pec_deck", label: "Pec Deck / Reverse Fly" },
            { value: "tricep_extension_machine", label: "Tricep Extension" },
            { value: "preacher_curl_machine", label: "Preacher Curl" },
            { value: "leg_press", label: "Leg Press" },
            { value: "leg_curl", label: "Leg Curl" },
            { value: "leg_extension", label: "Leg Extension" },
            { value: "hack_squat", label: "Hack Squat" },
            { value: "hip_thrust_machine", label: "Hip Thrust" },
            { value: "hip_abduction_machine", label: "Hip Abduction" },
            { value: "ab_crunch_machine", label: "เครื่อง Crunch" },
            { value: "standing_calf_raise_machine", label: "Calf (ยืน)" },
            { value: "seated_calf_raise_machine", label: "Calf (นั่ง)" },
        ],
    },
];

/** All known equipment values in one set (for "unknown tick" display). */
export const ALL_EQUIPMENT_VALUES = new Set(
    EQUIPMENT_GROUPS.flatMap((g) => g.items.map((i) => i.value)),
);

export function equipmentLabel(value: string): string {
    for (const group of EQUIPMENT_GROUPS) {
        const hit = group.items.find((i) => i.value === value);
        if (hit) return hit.label;
    }
    return value;
}
