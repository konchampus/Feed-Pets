export type ReminderSchedule = {
	local_time: string;
	timezone: string;
	weekdays: number[];
	last_notified_for: string | null;
};

export type DueReminder<T> = { schedule: T; localDate: string };

export function getLocalTime(date: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
	}).formatToParts(date);
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
	return { date: `${value('year')}-${value('month')}-${value('day')}`, minute: `${value('hour')}:${value('minute')}`, weekday };
}

export function getDueReminders<T extends ReminderSchedule>(schedules: T[], now: Date): DueReminder<T>[] {
	const due: DueReminder<T>[] = [];
	for (const schedule of schedules) {
		let localTime: ReturnType<typeof getLocalTime>;
		try { localTime = getLocalTime(now, schedule.timezone); } catch { continue; }
		const scheduledTime = String(schedule.local_time).slice(0, 5);
		if (schedule.weekdays.includes(localTime.weekday) && scheduledTime <= localTime.minute && schedule.last_notified_for !== localTime.date) {
			due.push({ schedule, localDate: localTime.date });
		}
	}
	return due;
}
