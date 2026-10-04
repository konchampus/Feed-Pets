import type { CareSchedule } from './types';

export type ScheduleOccurrence = { schedule: CareSchedule; nextAt: Date };
export type ZonedDateParts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };

const minuteMs = 60_000;
const weekdayNumbers: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
		hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
	return {
		year: Number(values.year), month: Number(values.month), day: Number(values.day),
		weekday: weekdayNumbers[values.weekday], hour: Number(values.hour), minute: Number(values.minute)
	};
}

export function findNextSchedule(schedules: CareSchedule[], petId: string, now: Date): ScheduleOccurrence | null {
	let nextOccurrence: ScheduleOccurrence | null = null;
	const currentMinute = Math.floor(now.getTime() / minuteMs) * minuteMs;
	const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

	for (const schedule of schedules) {
		if (!schedule.enabled || schedule.petId !== petId || !Array.isArray(schedule.days) || !schedule.days.length) continue;
		const timeParts = /^(\d{2}):(\d{2})$/.exec(schedule.time);
		if (!timeParts) continue;
		const hour = Number(timeParts[1]);
		const minute = Number(timeParts[2]);
		if (hour > 23 || minute > 59) continue;
		const timeZone = schedule.timezone ?? localTimeZone;
		let today: ZonedDateParts;
		try { today = getZonedDateParts(now, timeZone); }
		catch { continue; }

		for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
			const calendarDay = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset));
			if (!schedule.days.includes(calendarDay.getUTCDay())) continue;
			const nextAt = resolveZonedTime(calendarDay.getUTCFullYear(), calendarDay.getUTCMonth() + 1, calendarDay.getUTCDate(), hour, minute, timeZone);
			if (!nextAt || nextAt.getTime() < currentMinute) continue;
			if (!nextOccurrence || nextAt < nextOccurrence.nextAt) nextOccurrence = { schedule, nextAt };
			break;
		}
	}

	return nextOccurrence;
}

function resolveZonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date | null {
	const target = Date.UTC(year, month - 1, day, hour, minute);
	const targetMinute = hour * 60 + minute;
	const targetDate = `${year}-${month}-${day}`;
	try {
		const offsets = new Set<number>();
		for (const hoursAround of [-36, -12, 0, 12, 36]) {
			const sample = new Date(target + hoursAround * 60 * minuteMs);
			const local = getZonedDateParts(sample, timeZone);
			const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
			offsets.add(localAsUtc - Math.floor(sample.getTime() / minuteMs) * minuteMs);
		}

		const candidates = [...offsets].map((offset) => new Date(target - offset));
		const matchingTimes = candidates.filter((candidate) => {
			const local = getZonedDateParts(candidate, timeZone);
			return `${local.year}-${local.month}-${local.day}` === targetDate && local.hour === hour && local.minute === minute;
		});
		if (matchingTimes.length) return matchingTimes.sort((first, second) => first.getTime() - second.getTime())[0];

		// During a spring-forward gap, use the first valid minute after the configured wall time.
		const afterGap = candidates.map((candidate) => ({ candidate, local: getZonedDateParts(candidate, timeZone) }))
			.filter(({ local }) => `${local.year}-${local.month}-${local.day}` === targetDate && local.hour * 60 + local.minute > targetMinute)
			.sort((first, second) => first.local.hour * 60 + first.local.minute - (second.local.hour * 60 + second.local.minute)
				|| first.candidate.getTime() - second.candidate.getTime())[0]?.candidate;
		if (!afterGap) return null;

		let firstValidMinute = afterGap;
		for (let offset = 0; offset < 180; offset++) {
			const previousMinute = new Date(firstValidMinute.getTime() - minuteMs);
			const local = getZonedDateParts(previousMinute, timeZone);
			if (`${local.year}-${local.month}-${local.day}` !== targetDate || local.hour * 60 + local.minute <= targetMinute) break;
			firstValidMinute = previousMinute;
		}
		return firstValidMinute;
	} catch {
		return null;
	}
}
