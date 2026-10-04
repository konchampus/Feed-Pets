import { afterEach, describe, expect, it, vi } from 'vitest';
import { addEvent, clearDataScope, flushPendingEvents, getCachedFamilyId, getEvents, getPendingEvents, getPendingPushEvents, getPets, isValidBackup, isValidCareAmount, legacyStarterPetId, mergePendingEvents, parseOptionalAmount, removePendingEvent, removePendingPushEvent, saveCachedFamilyId, saveEvents, savePendingEvent, savePendingPushEvent, savePets, setDataScope, todayMeals } from './store';
import type { CareEvent, Pet } from './types';

afterEach(() => { localStorage.clear(); setDataScope('local'); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('care journal storage', () => {
	it('starts without a sample dog', () => {
		expect(getPets()).toEqual([]);
	});
	it('removes the old starter profile and keeps real dog profiles', () => {
		const legacyPet: Pet = { id: legacyStarterPetId, name: 'Мило', breed: 'Корги', birthday: '2022-04-16', weightKg: 12.4, allergies: '', healthNotes: '' };
		const familyPet: Pet = { id: 'family-dog', name: 'Рада', breed: 'Метис', birthday: '', weightKg: 0, allergies: '', healthNotes: '' };
		savePets([legacyPet, familyPet]);
		expect(getPets()).toEqual([familyPet]);
		expect(JSON.parse(localStorage.getItem('lapki:pets') ?? '[]')).toEqual([familyPet]);
	});

	it('checks care amounts against the limits used by each form', () => {
		expect(isValidCareAmount('meal', '1')).toBe(true);
		expect(isValidCareAmount('meal', '5000')).toBe(true);
		expect(isValidCareAmount('meal', '0')).toBe(false);
		expect(isValidCareAmount('meal', '1.5')).toBe(false);
		expect(isValidCareAmount('walk', '601')).toBe(false);
		expect(isValidCareAmount('weight', '0.1')).toBe(true);
		expect(isValidCareAmount('weight', '12.34')).toBe(false);
		expect(isValidCareAmount('weight', '201')).toBe(false);
		expect(isValidCareAmount('water', '5')).toBe(false);
		expect(isValidCareAmount('meal', '')).toBe(true);
		expect(isValidCareAmount('meal', 80)).toBe(true);
		expect(isValidCareAmount('meal', 0)).toBe(false);
		expect(isValidCareAmount('walk', 30)).toBe(true);
		expect(isValidCareAmount('weight', 12.3)).toBe(true);
		expect(isValidCareAmount('weight', 12.34)).toBe(false);
		expect(isValidCareAmount('meal', undefined)).toBe(true);
		expect(parseOptionalAmount('')).toBeUndefined();
		expect(parseOptionalAmount(undefined)).toBeUndefined();
		expect(parseOptionalAmount('80')).toBe(80);
		expect(parseOptionalAmount(80)).toBe(80);
	});

	it('accepts a complete backup and rejects malformed or unrelated records', () => {
		const backup = {
			pets: [{ id: 'milo', name: 'Мило', breed: 'Корги', birthday: '2022-04-16', weightKg: 12.4, allergies: '', healthNotes: '' }],
			events: [{ id: 'meal-1', petId: 'milo', kind: 'meal', occurredAt: '2026-10-02T08:00:00.000Z', by: 'Я', amount: 80, unit: 'г' }],
			schedules: [{ id: 'schedule-1', petId: 'milo', kind: 'meal', title: 'Утренний корм', time: '08:00', timezone: 'Europe/Moscow', days: [0, 1, 2, 3, 4, 5, 6], enabled: true }]
		};
		expect(isValidBackup(backup)).toBe(true);
		expect(isValidBackup({ ...backup, schedules: [{ ...backup.schedules[0], timezone: 'Mars/Olympus' }] })).toBe(false);
		expect(isValidBackup({ pets: [{}], events: [] })).toBe(false);
		expect(isValidBackup({ ...backup, events: [{ ...backup.events[0], petId: 'unknown' }] })).toBe(false);
		expect(isValidBackup({ ...backup, schedules: [{ ...backup.schedules[0], time: '25:00' }] })).toBe(false);
		expect(isValidBackup({ pets: backup.pets, events: backup.events })).toBe(false);
		expect(isValidBackup({ pets: [], events: [], schedules: [] })).toBe(true);
	});

	it('counts only this dog\'s meals from the current local day', () => {
		vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T12:00:00'));
		const rows: CareEvent[] = [
			{ id: '1', petId: 'milo', kind: 'meal', occurredAt: '2026-10-02T08:00:00', by: 'Я', amount: 80 },
			{ id: '2', petId: 'milo', kind: 'walk', occurredAt: '2026-10-02T09:00:00', by: 'Я' },
			{ id: '3', petId: 'milo', kind: 'meal', occurredAt: '2026-10-01T23:59:00', by: 'Я', amount: 90 }
		];
		expect(todayMeals(rows, 'milo')).toHaveLength(1);
		expect(todayMeals(rows, 'milo').reduce((sum, row) => sum + (row.amount ?? 0), 0)).toBe(80);
	});

	it('persists newly logged care events', () => {
		vi.stubGlobal('crypto', { randomUUID: () => 'event-1' });
		const newEvent = addEvent({ petId: 'milo', kind: 'water', by: 'Я', occurredAt: '2026-10-02T10:00:00.000Z' });
		expect(newEvent).toMatchObject({ id: 'event-1', kind: 'water', petId: 'milo' });
		expect(getEvents()[0]).toEqual(newEvent);
	});

	it('keeps each signed-in family data separate from local mode', () => {
		setDataScope('family-a'); saveEvents([{ id: 'a', petId: 'milo', kind: 'meal', occurredAt: '2026-10-02T10:00:00.000Z', by: 'A' }]);
		setDataScope('family-b'); expect(getEvents()).toEqual([]);
		setDataScope('local'); expect(getEvents()).toEqual([]);
		setDataScope('family-a'); expect(getEvents()[0].id).toBe('a');
	});

	it('remembers only valid family IDs under their signed-in user', () => {
		const userId = '123e4567-e89b-42d3-a456-426614174000';
		const familyId = '123e4567-e89b-42d3-a456-426614174001';
		saveCachedFamilyId(userId, familyId);
		expect(getCachedFamilyId(userId)).toBe(familyId);
		expect(getCachedFamilyId('other-user')).toBe('');
		saveCachedFamilyId(userId, 'bad-id');
		expect(getCachedFamilyId(userId)).toBe('');
	});

	it('removes only the revoked family cache', () => {
		const familyPet: Pet = { id: 'family-dog', name: 'Рада', breed: 'Метис', birthday: '', weightKg: 0, allergies: '', healthNotes: '' };
		const privatePet = { ...familyPet, id: 'private-dog' };
		setDataScope('family:family-a'); savePets([familyPet]);
		setDataScope('user:user-a'); savePets([privatePet]);

		clearDataScope('family:family-a');
		setDataScope('user:user-a'); expect(getPets()).toEqual([privatePet]);
		setDataScope('family:family-a'); expect(getPets()).toEqual([]);
	});

	it('keeps pending family events scoped and merges them with server events', () => {
		const serverEvent: CareEvent = { id: 'server-event', petId: 'dog', kind: 'meal', occurredAt: '2026-10-02T11:00:00.000Z', by: 'Аня' };
		const pendingEvent: CareEvent = { id: 'pending-event', petId: 'dog', kind: 'walk', occurredAt: '2026-10-02T12:00:00.000Z', by: 'Я' };
		setDataScope('family-a');
		savePendingEvent(pendingEvent);
		savePendingEvent(pendingEvent);
		expect(getPendingEvents()).toEqual([pendingEvent]);
		expect(mergePendingEvents([serverEvent])).toEqual([pendingEvent, serverEvent]);
		expect(mergePendingEvents([{ ...serverEvent, id: 'pending-event' }])).toEqual([pendingEvent]);

		setDataScope('family-b');
		expect(getPendingEvents()).toEqual([]);
		setDataScope('family-a');
		removePendingEvent(pendingEvent.id);
		expect(getPendingEvents()).toEqual([]);
	});

	it('replaces an older copy of an edited pending event', () => {
		const pendingEvent: CareEvent = { id: 'pending-event', petId: 'dog', kind: 'meal', occurredAt: '2026-10-02T12:00:00.000Z', by: 'Я', amount: 80, unit: 'г' };
		const updatedEvent = { ...pendingEvent, amount: 95 };
		setDataScope('family-a');
		savePendingEvent(pendingEvent);
		savePendingEvent(updatedEvent);
		expect(getPendingEvents()).toEqual([updatedEvent]);
	});

	it('keeps an edit made while a pending event is being sent', async () => {
		const pendingEvent: CareEvent = { id: 'pending-event', petId: 'dog', kind: 'meal', occurredAt: '2026-10-02T12:00:00.000Z', by: 'Я', amount: 80, unit: 'г' };
		const updatedEvent = { ...pendingEvent, amount: 95 };
		setDataScope('family-a');
		savePendingEvent(pendingEvent);
		await flushPendingEvents(async () => {
			savePendingEvent(updatedEvent);
			return 'confirmed';
		});
		expect(getPendingEvents()).toEqual([updatedEvent]);
	});

	it('keeps failed events queued and removes them after a successful retry', async () => {
		const pendingEvent: CareEvent = { id: 'pending-event', petId: 'dog', kind: 'meal', occurredAt: '2026-10-02T12:00:00.000Z', by: 'Я', amount: 80, unit: 'г' };
		setDataScope('family-a');
		savePendingEvent(pendingEvent);
		const failedSync = await flushPendingEvents(async () => 'failed');
		expect(failedSync.failedCount).toBe(1);
		expect(getPendingEvents()).toEqual([pendingEvent]);

		const successfulSync = await flushPendingEvents(async (event) => {
			savePendingPushEvent(event.id, event.authorId ?? 'user-a');
			return 'confirmed';
		});
		expect(successfulSync.confirmedEvents).toEqual([pendingEvent]);
		expect(getPendingEvents()).toEqual([]);
		expect(getPendingPushEvents()).toEqual([{ eventId: pendingEvent.id, authorId: 'user-a' }]);
	});

	it('leaves queued events untouched when a retry is deferred', async () => {
		const pendingEvent: CareEvent = { id: 'pending-event', petId: 'dog', kind: 'meal', occurredAt: '2026-10-02T12:00:00.000Z', by: 'Я' };
		setDataScope('family-a');
		savePendingEvent(pendingEvent);
		const result = await flushPendingEvents(async () => 'deferred');
		expect(result.deferred).toBe(true);
		expect(getPendingEvents()).toEqual([pendingEvent]);
	});

	it('keeps pending push deliveries separate and family scoped', () => {
		setDataScope('family-a');
		savePendingPushEvent('event-a', 'user-a');
		savePendingPushEvent('event-a', 'user-a');
		expect(getPendingPushEvents()).toEqual([{ eventId: 'event-a', authorId: 'user-a' }]);
		setDataScope('family-b');
		expect(getPendingPushEvents()).toEqual([]);
		setDataScope('family-a');
		removePendingPushEvent('event-a');
		expect(getPendingPushEvents()).toEqual([]);
	});
});
