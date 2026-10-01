import type { CareEvent, CareSchedule, Pet } from './types';

const samplePet: Pet = {
	id: 'milo', name: 'Мило', breed: 'Корги', birthday: '2022-04-16', weightKg: 12.4,
	allergies: '', healthNotes: ''
};

function read<T>(key: string, fallback: T): T {
	if (typeof localStorage === 'undefined') return fallback;
	try {
		const value = localStorage.getItem(`lapki:${key}`);
		return value ? (JSON.parse(value) as T) : fallback;
	} catch { return fallback; }
}

function write<T>(key: string, value: T) {
	if (typeof localStorage !== 'undefined') localStorage.setItem(`lapki:${key}`, JSON.stringify(value));
}

export function getPets(): Pet[] { return read('pets', [samplePet]); }
export function savePets(pets: Pet[]) { write('pets', pets); }
export function getEvents(): CareEvent[] { return read('events', []); }
export function saveEvents(events: CareEvent[]) { write('events', events); }
export function getSchedules(): CareSchedule[] { return read('schedules', []); }
export function saveSchedules(schedules: CareSchedule[]) { write('schedules', schedules); }

export function addEvent(event: Omit<CareEvent, 'id' | 'occurredAt'> & { occurredAt?: string }): CareEvent[] {
	const events = getEvents();
	events.unshift({ id: crypto.randomUUID(), occurredAt: event.occurredAt ?? new Date().toISOString(), ...event });
	saveEvents(events);
	return events;
}

export function todayMeals(events: CareEvent[], petId: string, now = new Date()) {
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	return events.filter((event) => event.petId === petId && event.kind === 'meal' && new Date(event.occurredAt).getTime() >= start);
}
