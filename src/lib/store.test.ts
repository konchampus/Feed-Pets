import { afterEach, describe, expect, it, vi } from 'vitest';
import { addEvent, getEvents, isValidBackup, isValidCareAmount, saveEvents, setDataScope, todayMeals } from './store';
import type { CareEvent } from './types';

afterEach(() => { localStorage.clear(); setDataScope('local'); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('care journal storage', () => {
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
	});

	it('accepts a complete backup and rejects malformed or unrelated records', () => {
		const backup = {
			pets: [{ id: 'milo', name: 'Мило', breed: 'Корги', birthday: '2022-04-16', weightKg: 12.4, allergies: '', healthNotes: '' }],
			events: [{ id: 'meal-1', petId: 'milo', kind: 'meal', occurredAt: '2026-10-02T08:00:00.000Z', by: 'Я', amount: 80, unit: 'г' }],
			schedules: [{ id: 'schedule-1', petId: 'milo', kind: 'meal', title: 'Утренний корм', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true }]
		};
		expect(isValidBackup(backup)).toBe(true);
		expect(isValidBackup({ pets: [{}], events: [] })).toBe(false);
		expect(isValidBackup({ ...backup, events: [{ ...backup.events[0], petId: 'unknown' }] })).toBe(false);
		expect(isValidBackup({ ...backup, schedules: [{ ...backup.schedules[0], time: '25:00' }] })).toBe(false);
		expect(isValidBackup({ pets: backup.pets, events: backup.events })).toBe(false);
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
});
