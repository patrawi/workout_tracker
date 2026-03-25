import { insertBodyweightLog, updateProfile } from './src/db.ts';

async function run() {
    await updateProfile({ weight_kg: 71.7, height_cm: 180, tdee: 2500, calories_intake: 2300 });

    // Based on the provided chart screenshot points (approximate matching the line)
    await insertBodyweightLog('2026-01-05', 72.5);
    await insertBodyweightLog('2026-01-12', 72.0);
    await insertBodyweightLog('2026-01-19', 72.2);
    await insertBodyweightLog('2026-01-27', 72.0);
    await insertBodyweightLog('2026-02-03', 70.5);
    await insertBodyweightLog('2026-02-04', 69.8);
    await insertBodyweightLog('2026-02-09', 72.1);
    await insertBodyweightLog('2026-02-16', 72.0);
    await insertBodyweightLog('2026-02-23', 71.8);
    await insertBodyweightLog('2026-03-09', 71.7);

    console.log('Seed done');
    process.exit(0);
}

run();
