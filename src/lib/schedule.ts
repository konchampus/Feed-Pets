import type { CareSchedule } from './types';

export type ScheduleOccurrence = { schedule: CareSchedule; nextAt: Date };

export function findNextSchedule(schedules: CareSchedule[], petId: string, now: Date): ScheduleOccurrence | null {
	let nextOccurrence: ScheduleOccurrence | null = null;
	const currentMinute = new Date(now);
	currentMinute.setSeconds(0, 0);

	for (const schedule of schedules) {
		if (!schedule.enabled || schedule.petId !== petId || !Array.isArray(schedule.days) || !schedule.days.length) continue;
		const timeParts = /^(\d{2}):(\d{2})$/.exec(schedule.time);
		if (!timeParts) continue;
		const hour = Number(timeParts[1]);
		const minute = Number(timeParts[2]);
		if (hour > 23 || minute > 59) continue;

		for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
			const nextAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour, minute);
			if (!schedule.days.includes(nextAt.getDay()) || nextAt < currentMinute) continue;
			if (!nextOccurrence || nextAt < nextOccurrence.nextAt) nextOccurrence = { schedule, nextAt };
			break;
		}
	}

	return nextOccurrence;
}
