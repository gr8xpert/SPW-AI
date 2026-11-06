import { MigrationInterface, QueryRunner } from 'typeorm';
import { OLD_DEFAULT_SCHEDULE, spreadOverNight } from '../../modules/feed/feed-stagger';

// 2026-11-06: every feed ran at 06:00 UTC, one queue of almost 6 hours. Feeds
// still on that old default get a night hour of their own (00-05 UTC),
// balanced by listing count. Feeds with a time someone chose stay as they are.
export class StaggerFeedSchedules1777570000000 implements MigrationInterface {
  name = 'StaggerFeedSchedules1777570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ id: number; syncSchedule: string | null; lastSyncCount: number | null }> =
      await queryRunner.query('SELECT id, syncSchedule, lastSyncCount FROM feed_configs');
    const onDefault = rows.filter((r) => (r.syncSchedule || '').trim() === OLD_DEFAULT_SCHEDULE);
    const planned = rows.filter((r) => (r.syncSchedule || '').trim() !== OLD_DEFAULT_SCHEDULE);

    for (const { feed, schedule } of spreadOverNight(onDefault, planned)) {
      await queryRunner.query('UPDATE feed_configs SET syncSchedule = ? WHERE id = ?', [schedule, feed.id]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE feed_configs SET syncSchedule = ? WHERE syncSchedule IN ('0 0 * * *','0 1 * * *','0 2 * * *','0 3 * * *','0 4 * * *','0 5 * * *')`,
      [OLD_DEFAULT_SCHEDULE],
    );
  }
}
