import { describe, expect, it } from 'vitest';
import { findNextSchedule } from './schedule';
import type { CareSchedule } from './types';

const everyDay = [0, 1, 2, 3, 4, 5, 6];

function makeSchedule(id: string, time: string, days = everyDay): CareSchedule {
	return { id, petId: 'dog-1', kind: 'meal', title: id, time, days, enabled: true };
}

describe('next care schedule', () => {
	it('chooses the nearest future occurrence instead of the first saved row', () => {
		const now = new Date(2026, 9, 4, 12, 0);
		const schedules = [makeSchedule('morning', '08:00'), makeSchedule('evening', '19:00')];

		expect(findNextSchedule(schedules, 'dog-1', now)).toMatchObject({
			schedule: { id: 'evening' },
			nextAt: new Date(2026, 9, 4, 19, 0)
		});
	});

	it('uses the next selected weekday after today’s time has passed', () => {
		const now = new Date(2026, 9, 4, 12, 0);
		const sundayOnly = makeSchedule('weekly', '08:00', [0]);

		expect(findNextSchedule([sundayOnly], 'dog-1', now)?.nextAt).toEqual(new Date(2026, 9, 11, 8, 0));
	});

	it('ignores disabled, unrelated and invalid schedules', () => {
		const now = new Date(2026, 9, 4, 12, 0);
		const schedules = [
			{ ...makeSchedule('disabled', '13:00'), enabled: false },
			{ ...makeSchedule('other-dog', '13:00'), petId: 'dog-2' },
			makeSchedule('invalid', '25:00')
		];

		expect(findNextSchedule(schedules, 'dog-1', now)).toBeNull();
	});
});
