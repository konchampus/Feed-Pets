import { afterEach, describe, expect, it, vi } from 'vitest';
import { addEvent, getEvents, saveEvents, setDataScope, todayMeals } from './store';
import type { CareEvent } from './types';

afterEach(() => { localStorage.clear(); setDataScope('local'); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('care journal storage', () => {
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
