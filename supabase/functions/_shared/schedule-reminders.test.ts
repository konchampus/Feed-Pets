import { describe, expect, it } from 'vitest';
import { getDueReminders, getLocalTime } from './schedule-reminders';

const everyDay = [0, 1, 2, 3, 4, 5, 6];

function makeSchedule(overrides: Partial<{ timezone: string; local_time: string; weekdays: number[]; last_notified_for: string | null }> = {}) {
	return { id: 'schedule-1', timezone: 'UTC', local_time: '23:59:00', weekdays: everyDay, last_notified_for: null, ...overrides };
}

describe('family push schedule timezone', () => {
	it('uses the schedule timezone for local date, weekday, and due time', () => {
		const schedule = makeSchedule({ timezone: 'Asia/Tokyo', local_time: '09:30:00', weekdays: [4] });

		expect(getLocalTime(new Date('2026-01-15T00:00:00.000Z'), schedule.timezone)).toMatchObject({
			date: '2026-01-15', minute: '09:00', weekday: 4
		});
		expect(getDueReminders([schedule], new Date('2026-01-15T00:00:00.000Z'))).toEqual([]);
		expect(getDueReminders([schedule], new Date('2026-01-15T00:30:00.000Z'))).toMatchObject([{ localDate: '2026-01-15' }]);
	});

	it('keeps the due date evaluated before midnight for the subsequent claim', () => {
		const schedule = makeSchedule({ timezone: 'UTC', local_time: '23:59:00', weekdays: [4] });
		const [dueReminder] = getDueReminders([schedule], new Date('2026-01-15T23:59:58.000Z'));

		expect(dueReminder.localDate).toBe('2026-01-15');
		expect(getLocalTime(new Date('2026-01-16T00:00:02.000Z'), 'UTC').date).toBe('2026-01-16');
	});

	it('waits until a missing spring-forward time has passed in its zone', () => {
		const schedule = makeSchedule({ timezone: 'America/New_York', local_time: '02:30:00', weekdays: [0] });

		expect(getDueReminders([schedule], new Date('2026-03-08T06:59:00.000Z'))).toEqual([]);
		expect(getDueReminders([schedule], new Date('2026-03-08T07:00:00.000Z'))).toMatchObject([{ localDate: '2026-03-08' }]);
	});

	it('does not send twice for a schedule already completed on its local date', () => {
		const schedule = makeSchedule({ last_notified_for: '2026-01-15', local_time: '08:00:00' });

		expect(getDueReminders([schedule], new Date('2026-01-15T12:00:00.000Z'))).toEqual([]);
	});

	it('ignores a row with an invalid timezone', () => {
		const schedule = makeSchedule({ timezone: 'Mars/Olympus' });

		expect(getDueReminders([schedule], new Date('2026-01-15T23:59:00.000Z'))).toEqual([]);
	});
});
