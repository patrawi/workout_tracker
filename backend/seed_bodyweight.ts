import { createDatabaseClient } from './src/db/client';
import { createProfileRepository } from './src/repositories/profile.repository';
import { createBodyweightRepository } from './src/repositories/bodyweight.repository';

const db = createDatabaseClient(process.env.DATABASE_URL || '');

const profileRepo = createProfileRepository(db);
const bodyweightRepo = createBodyweightRepository(db);

async function run() {
    await profileRepo.update({ weight_kg: 71.7, height_cm: 180, tdee: 2500, calories_intake: 2300, protein_target: 0, carbs_target: 0, fat_target: 0 });

    // Based on the provided chart screenshot points (approximate matching the line)
    await bodyweightRepo.insert('2026-01-05', 72.5);
    await bodyweightRepo.insert('2026-01-12', 72.0);
    await bodyweightRepo.insert('2026-01-19', 72.2);
    await bodyweightRepo.insert('2026-01-27', 72.0);
    await bodyweightRepo.insert('2026-02-03', 70.5);
    await bodyweightRepo.insert('2026-02-04', 69.8);
    await bodyweightRepo.insert('2026-02-09', 72.1);
    await bodyweightRepo.insert('2026-02-16', 72.0);
    await bodyweightRepo.insert('2026-02-23', 71.8);
    await bodyweightRepo.insert('2026-03-09', 71.7);

    console.log('Seed done');
    process.exit(0);
}

run();
