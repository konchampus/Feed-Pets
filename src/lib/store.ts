import type { CareEvent, CareKind, CareSchedule, Pet } from './types';

export const legacyStarterPetId = 'milo';

let dataScope = 'local';

export function setDataScope(scope: string) { dataScope = scope; }

export function clearDataScope(scope: string) {
	if (typeof localStorage === 'undefined') return;
	for (const key of ['pets', 'events', 'schedules', 'pendingEvents', 'pendingPushEvents']) {
		localStorage.removeItem(scope === 'local' ? `lapki:${key}` : `lapki:${scope}:${key}`);
	}
}

function read<T>(key: string, fallback: T): T {
	if (typeof localStorage === 'undefined') return fallback;
	try {
		const value = localStorage.getItem(dataScope === 'local' ? `lapki:${key}` : `lapki:${dataScope}:${key}`);
		return value ? (JSON.parse(value) as T) : fallback;
	} catch { return fallback; }
}

function write<T>(key: string, value: T) {
	if (typeof localStorage !== 'undefined') localStorage.setItem(dataScope === 'local' ? `lapki:${key}` : `lapki:${dataScope}:${key}`, JSON.stringify(value));
}

function isLegacyStarterPet(pet: Pet) {
	return pet.id === legacyStarterPetId && pet.name === 'Мило' && pet.breed === 'Корги'
		&& pet.birthday === '2022-04-16' && pet.weightKg === 12.4 && !pet.allergies && !pet.healthNotes;
}

export function getPets(): Pet[] {
	const pets = read('pets', []);
	const savedPets = pets.filter((pet) => !isLegacyStarterPet(pet));
	if (savedPets.length !== pets.length) savePets(savedPets);
	return savedPets;
}
export function savePets(pets: Pet[]) { write('pets', pets); }
export function getEvents(): CareEvent[] { return read('events', []); }
export function saveEvents(events: CareEvent[]) { write('events', events); }
export function getPendingEvents(): CareEvent[] { return read('pendingEvents', []); }
export function savePendingEvent(event: CareEvent) {
	const pendingEvents = getPendingEvents();
	const eventIndex = pendingEvents.findIndex((pendingEvent) => pendingEvent.id === event.id);
	if (eventIndex === -1) pendingEvents.push(event);
	else pendingEvents[eventIndex] = event;
	write('pendingEvents', pendingEvents);
}
export function removePendingEvent(eventId: string, expectedEvent?: CareEvent) {
	write('pendingEvents', getPendingEvents().filter((event) => {
		if (event.id !== eventId) return true;
		return expectedEvent !== undefined && JSON.stringify(event) !== JSON.stringify(expectedEvent);
	}));
}
export type PendingPushEvent = { eventId: string; authorId: string };
export function getPendingPushEvents(): PendingPushEvent[] { return read('pendingPushEvents', []); }
export function savePendingPushEvent(eventId: string, authorId: string) {
	const pendingPushEvents = getPendingPushEvents();
	if (!pendingPushEvents.some((pendingEvent) => pendingEvent.eventId === eventId)) {
		pendingPushEvents.push({ eventId, authorId });
		write('pendingPushEvents', pendingPushEvents);
	}
}
export function removePendingPushEvent(eventId: string) {
	write('pendingPushEvents', getPendingPushEvents().filter((event) => event.eventId !== eventId));
}
export type PendingEventResult = 'confirmed' | 'failed' | 'deferred';
export async function flushPendingEvents(
	saveEvent: (event: CareEvent) => Promise<PendingEventResult>,
	pendingEvents = getPendingEvents()
) {
	const confirmedEvents: CareEvent[] = [];
	let failedCount = 0;
	for (const event of pendingEvents) {
		let result: PendingEventResult;
		try { result = await saveEvent(event); }
		catch { result = 'failed'; }
		if (result === 'deferred') return { confirmedEvents, failedCount, deferred: true };
		if (result === 'failed') { failedCount++; continue; }
		removePendingEvent(event.id, event);
		confirmedEvents.push(event);
	}
	return { confirmedEvents, failedCount, deferred: false };
}
export function mergePendingEvents(serverEvents: CareEvent[], pendingEvents = getPendingEvents()) {
	const mergedEvents = new Map(serverEvents.map((event) => [event.id, event]));
	for (const event of pendingEvents) mergedEvents.set(event.id, event);
	return [...mergedEvents.values()].sort((first, second) => second.occurredAt.localeCompare(first.occurredAt));
}
export function getSchedules(): CareSchedule[] { return read('schedules', []); }
export function saveSchedules(schedules: CareSchedule[]) { write('schedules', schedules); }

export function addEvent(event: Omit<CareEvent, 'id' | 'occurredAt'> & { occurredAt?: string }): CareEvent {
	const events = getEvents();
	const newEvent = { id: crypto.randomUUID(), occurredAt: event.occurredAt ?? new Date().toISOString(), ...event };
	events.unshift(newEvent);
	saveEvents(events);
	return newEvent;
}

export function todayMeals(events: CareEvent[], petId: string, now = new Date()) {
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	return events.filter((event) => event.petId === petId && event.kind === 'meal' && new Date(event.occurredAt).getTime() >= start);
}

export function isValidCareAmount(kind: CareKind, value: string | number | undefined) {
	if (value === undefined || (typeof value === 'string' && !value.trim())) return true;
	const amount = typeof value === 'number' ? value : Number(value.trim());
	if (!Number.isFinite(amount)) return false;
	if (kind === 'meal') return Number.isInteger(amount) && amount >= 1 && amount <= 5000;
	if (kind === 'walk') return Number.isInteger(amount) && amount >= 1 && amount <= 600;
	if (kind === 'weight') return Number.isInteger(amount * 10) && amount >= 0.1 && amount <= 200;
	return false;
}

export function parseOptionalAmount(value: string | number | undefined) {
	if (value === undefined || (typeof value === 'string' && !value.trim())) return undefined;
	return typeof value === 'number' ? value : Number(value.trim());
}

export function isValidBackup(value: unknown): value is { pets: Pet[]; events: CareEvent[]; schedules: CareSchedule[] } {
	if (!isRecord(value) || !Array.isArray(value.pets) || !Array.isArray(value.events) || !Array.isArray(value.schedules)) return false;
	const schedules = value.schedules;
	if (!Array.isArray(schedules)) return false;
	if (!value.pets.every(isPet) || !value.events.every(isCareEvent) || !schedules.every(isCareSchedule)) return false;

	const petIds = new Set(value.pets.map((pet) => pet.id));
	const eventIds = new Set(value.events.map((event) => event.id));
	const scheduleIds = new Set(schedules.map((schedule) => schedule.id));
	return petIds.size === value.pets.length
		&& eventIds.size === value.events.length
		&& scheduleIds.size === schedules.length
		&& value.events.every((event) => petIds.has(event.petId))
		&& schedules.every((schedule) => petIds.has(schedule.petId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown) {
	return value === undefined || typeof value === 'string';
}

function isCareKind(value: unknown): value is CareKind {
	return value === 'meal' || value === 'walk' || value === 'water' || value === 'medicine'
		|| value === 'weight' || value === 'vet' || value === 'vaccine';
}

function isValidDate(value: unknown) {
	return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function isPet(value: unknown): value is Pet {
	if (!isRecord(value)) return false;
	return isNonEmptyString(value.id)
		&& isNonEmptyString(value.name)
		&& typeof value.breed === 'string'
		&& typeof value.birthday === 'string'
		&& (value.birthday === '' || isValidDate(value.birthday))
		&& typeof value.weightKg === 'number' && Number.isFinite(value.weightKg) && value.weightKg >= 0 && value.weightKg <= 200
		&& typeof value.allergies === 'string'
		&& typeof value.healthNotes === 'string'
		&& isOptionalString(value.photo);
}

function isCareEvent(value: unknown): value is CareEvent {
	if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.petId)
		|| !isCareKind(value.kind) || !isValidDate(value.occurredAt) || typeof value.by !== 'string'
		|| !isOptionalString(value.authorId) || !isOptionalString(value.unit)
		|| !isOptionalString(value.label) || !isOptionalString(value.note)) return false;

	if (value.amount === undefined) return true;
	return typeof value.amount === 'number' && Number.isFinite(value.amount)
		&& isValidCareAmount(value.kind, String(value.amount));
}

function isCareSchedule(value: unknown): value is CareSchedule {
	if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.petId)
		|| !isCareKind(value.kind) || !isNonEmptyString(value.title)
		|| typeof value.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)
		|| !Array.isArray(value.days) || value.days.length === 0 || typeof value.enabled !== 'boolean') return false;
	return value.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
		&& new Set(value.days).size === value.days.length;
}
