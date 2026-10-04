export type CareKind = 'meal' | 'walk' | 'water' | 'medicine' | 'weight' | 'vet' | 'vaccine';

export type Pet = {
	id: string;
	name: string;
	breed: string;
	birthday: string;
	photo?: string;
	weightKg: number;
	allergies: string;
	healthNotes: string;
};

export type CareEvent = {
	id: string;
	petId: string;
	kind: CareKind;
	occurredAt: string;
	by: string;
	authorId?: string;
	amount?: number;
	unit?: string;
	label?: string;
	note?: string;
};

export type CareSchedule = {
	id: string;
	petId: string;
	kind: CareKind;
	title: string;
	time: string;
	timezone?: string;
	days: number[];
	enabled: boolean;
};

export const careLabels: Record<CareKind, string> = {
	meal: 'Кормление', walk: 'Прогулка', water: 'Вода', medicine: 'Лекарство',
	weight: 'Вес', vet: 'Ветеринар', vaccine: 'Прививка'
};

export const careIcons: Record<CareKind, string> = {
	meal: '◒', walk: '⌁', water: '◡', medicine: '✳', weight: '↗', vet: '+', vaccine: '✦'
};
