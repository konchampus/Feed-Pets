<script lang="ts">
	export const prerender = true;

	import { onMount, tick } from 'svelte';
	import { base } from '$app/paths';
	import BowlScene from '$lib/BowlScene.svelte';
	import { addEvent, getEvents, getPets, getSchedules, isValidBackup, isValidCareAmount, parseOptionalAmount, saveEvents, savePets, saveSchedules, setDataScope, todayMeals } from '$lib/store';
	import { careIcons, careLabels, type CareEvent, type CareKind, type CareSchedule, type Pet } from '$lib/types';
	import { supabaseClient } from '$lib/supabase';
	import { PUBLIC_VAPID_KEY } from '$env/static/public';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	type Tab = 'home' | 'history' | 'schedule' | 'settings';
	let tab = $state<Tab>('home');
	let appReady = $state(false);
	let pets = $state<Pet[]>([{ id: 'milo', name: 'Мило', breed: 'Корги', birthday: '2022-04-16', weightKg: 12.4, allergies: '', healthNotes: '' }]);
	let events = $state<CareEvent[]>([]);
	let schedules = $state<CareSchedule[]>([]);
	let petIndex = $state(0);
	let member = $state('Я');
	let sheetKind = $state<CareKind | null>(null);
	let editingEventId = $state('');
	let settingsPanel = $state<'profile' | 'add-pet' | 'auth' | ''>('');
	let toast = $state('');
	let amount = $state<string | number | undefined>('');
	let label = $state('');
	let note = $state('');
	let authEmail = $state('');
	let authUsername = $state('');
	let authPassword = $state('');
	let authMode = $state<'signin' | 'signup' | 'reset'>('signin');
	let authMessage = $state('');
	let cloudUser = $state('');
	let currentUserId = $state('');
	let familyId = $state('');
	let familyName = $state('');
	let familyRole = $state<'owner' | 'member' | ''>('');
	let familyPetName = $state('');
	let familyPetBreed = $state('');
	let inviteLink = $state('');
	let inviteEmail = $state('');
	let familyChannel: RealtimeChannel | null = null;
	let pushEnabled = $state(false);
	let soundEnabled = $state(false);
	let reducedMotion = $state(false);
	let scene = $state(true);
	let scheduleTitle = $state('');
	let scheduleTime = $state('08:00');
	let scheduleKind = $state<CareKind>('meal');
	let petBirthday = $state('');
	let petWeight = $state<string | number | undefined>('');
	let petAllergies = $state('');
	let petHealthNotes = $state('');
	let fileInput = $state<HTMLInputElement>();
	let careDialog = $state<HTMLDivElement>();
	let restoreFocusTarget: HTMLElement | null = null;
	let toastTimer: ReturnType<typeof setTimeout>;
	let authListener: { unsubscribe: () => void } | null = null;
	const kindOptions: CareKind[] = ['meal', 'walk', 'water', 'medicine', 'weight', 'vet', 'vaccine'];
	const supabase = supabaseClient();
	let isConfigured = $state(Boolean(supabase && PUBLIC_VAPID_KEY));
	let activePet = $derived(pets[Math.min(petIndex, pets.length - 1)]);
	let meals = $derived(todayMeals(events, activePet?.id ?? ''));
	let grams = $derived(meals.reduce((sum, event) => sum + (event.amount ?? 0), 0));
	let sortedEvents = $derived([...events].filter((event) => event.petId === activePet?.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
	let weekCount = $derived(events.filter((event) => event.petId === activePet?.id && Date.now() - new Date(event.occurredAt).getTime() < 7 * 86400000).length);
	let dateText = $derived(new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));

	$effect(() => {
		if (sheetKind && careDialog) {
			careDialog.querySelector<HTMLInputElement>('input:not([type="file"]), textarea, select')?.focus();
		}
	});

	onMount(() => {
		setDataScope('local');
		member = localStorage.getItem('lapki:member') ?? 'Я';
		reducedMotion = localStorage.getItem('lapki:reduced-motion') === 'true';
		soundEnabled = localStorage.getItem('lapki:sound') === 'true';
		if (supabase) {
			pets = []; events = []; schedules = [];
			void supabase.auth.getUser().then(({ data }) => {
				if (!data.user) {
					pets = getPets(); events = getEvents(); schedules = getSchedules();
					return;
				}
				currentUserId = data.user.id;
				cloudUser = data.user.user_metadata.display_name || data.user.email || '';
				member = data.user.user_metadata.display_name || data.user.email?.split('@')[0] || member;
				void loadFamily(data.user.id).then(() => { if (new URLSearchParams(location.search).has('invite')) void acceptInvite(); });
			});
		} else {
			pets = getPets(); events = getEvents(); schedules = getSchedules();
		}
		appReady = true;
		if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => pushEnabled = Boolean(subscription)).catch(() => undefined);
		if (supabase) authListener = supabase.auth.onAuthStateChange((event) => {
			if (event === 'PASSWORD_RECOVERY') { tab = 'settings'; settingsPanel = 'auth'; authMode = 'reset'; authMessage = 'Введите новый пароль.'; }
		}).data.subscription;
		const query = new URLSearchParams(location.search);
		if (query.get('invite')) { tab = 'settings'; settingsPanel = 'auth'; authMessage = 'Войдите или создайте аккаунт, чтобы принять приглашение.'; }
		return () => { if (familyChannel && supabase) void supabase.removeChannel(familyChannel); authListener?.unsubscribe(); clearTimeout(toastTimer); };
	});

	function notify(message: string) {
		toast = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast = '', 2800);
	}
	function updateEvents(rows: CareEvent[]) { events = rows; saveEvents(rows); }
	function rememberFocus() {
		restoreFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	}
	function closeCareForm() {
		sheetKind = null; editingEventId = '';
		void tick().then(() => {
			if (restoreFocusTarget?.isConnected) restoreFocusTarget.focus();
			restoreFocusTarget = null;
		});
	}
	function handleCareDialogKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') { event.preventDefault(); closeCareForm(); return; }
		if (event.key !== 'Tab' || !careDialog) return;
		const focusable = Array.from(careDialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
			.filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
		if (focusable.length === 0) { event.preventDefault(); careDialog.focus(); return; }
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && (document.activeElement === first || !careDialog.contains(document.activeElement))) {
			event.preventDefault(); last.focus();
		} else if (!event.shiftKey && (document.activeElement === last || !careDialog.contains(document.activeElement))) {
			event.preventDefault(); first.focus();
		}
	}
	function openForm(kind: CareKind) { rememberFocus(); editingEventId = ''; sheetKind = kind; amount = kind === 'meal' ? '80' : ''; label = ''; note = ''; }
	function editEvent(event: CareEvent) { rememberFocus(); editingEventId = event.id; sheetKind = event.kind; amount = event.amount?.toString() ?? ''; label = event.label ?? ''; note = event.note ?? ''; }
	async function saveCare() {
		if (!sheetKind || !activePet) return;
		if (!isValidCareAmount(sheetKind, amount)) { notify('Проверьте допустимое количество'); return; }
		const savedAmount = parseOptionalAmount(amount);
		if (editingEventId) {
			const original = events.find((event) => event.id === editingEventId);
			if (!original) return;
			const updated = { ...original, amount: savedAmount, unit: sheetKind === 'meal' ? 'г' : sheetKind === 'walk' ? 'мин' : sheetKind === 'weight' ? 'кг' : undefined, label: label.trim() || undefined, note: note.trim() || undefined };
			if (supabase && familyId) {
				const { error } = await supabase.from('care_events').update({ amount: updated.amount ?? null, unit: updated.unit ?? null, label: updated.label ?? null, note: updated.note ?? null }).eq('id', updated.id);
				if (error) { notify('Не удалось изменить эту запись'); return; }
			}
			updateEvents(events.map((event) => event.id === updated.id ? updated : event));
			closeCareForm(); notify('Запись исправлена'); return;
		}
		const event = addEvent({ petId: activePet.id, kind: sheetKind, by: member, authorId: currentUserId || undefined, amount: savedAmount, unit: sheetKind === 'meal' ? 'г' : sheetKind === 'walk' ? 'мин' : sheetKind === 'weight' ? 'кг' : undefined, label: label.trim() || undefined, note: note.trim() || undefined });
		updateEvents(getEvents()); closeCareForm(); notify(`${careLabels[event.kind]} отмечено`);
		if (supabase && cloudUser) void syncEvent(event);
	}
	async function syncEvent(event: CareEvent) {
		if (!supabase || !familyId) return;
		const { error } = await supabase.from('care_events').insert({ id: event.id, family_id: familyId, pet_id: event.petId, kind: event.kind, occurred_at: event.occurredAt, actor_name: member, amount: event.amount, unit: event.unit, label: event.label, note: event.note });
		if (error) notify('Запис сохранён на устройстве, синхронизация не удалась');
		else {
			for (let attempt = 0; attempt < 4; attempt++) {
				const { error: pushError } = await supabase.functions.invoke('push-event', { body: { eventId: event.id } });
				if (!pushError) return;
				if (attempt < 3) {
					const response = pushError.context instanceof Response ? pushError.context : null;
					const retryAfter = Number(response?.headers.get('Retry-After'));
					await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : (attempt + 1) * 1500));
				}
			}
			notify('Запись сохранена; уведомление семье пока не отправлено');
		}
	}
	async function loadFamily(userId = '') {
		if (!supabase) return;
		if (userId) setDataScope(`user:${userId}`);
		const { data: memberships } = await supabase.from('family_members').select('family_id,role,families(name)').limit(1);
		const membership = memberships?.[0];
		if (!membership) {
			if (familyChannel) { void supabase.removeChannel(familyChannel); familyChannel = null; }
			familyId = ''; familyRole = ''; familyName = ''; pets = []; events = []; schedules = [];
			savePets(pets); saveEvents(events); saveSchedules(schedules);
			return;
		}
		familyId = membership.family_id;
		familyRole = membership.role;
		setDataScope(`family:${familyId}`);
		familyName = (membership.families as { name?: string } | null)?.name ?? '';
		const [petResult, eventResult, scheduleResult] = await Promise.all([
			supabase.from('pets').select('id,name,breed,birthday,photo_url,allergies,health_notes').eq('family_id', familyId),
			supabase.from('care_events').select('id,pet_id,kind,occurred_at,author_id,actor_name,amount,unit,label,note').eq('family_id', familyId).order('occurred_at', { ascending: false }).limit(500),
			supabase.from('care_schedules').select('id,pet_id,kind,title,local_time,weekdays,is_active').eq('family_id', familyId)
		]);
		if (eventResult.data) {
			events = eventResult.data.map((row) => ({ id: row.id, petId: row.pet_id, kind: row.kind, occurredAt: row.occurred_at, authorId: row.author_id, by: row.actor_name, amount: row.amount ? Number(row.amount) : undefined, unit: row.unit ?? undefined, label: row.label ?? undefined, note: row.note ?? undefined }));
			saveEvents(events);
		}
		const latestWeight = new Map<string, number>();
		for (const event of events) {
			if (event.kind === 'weight' && event.amount && !latestWeight.has(event.petId)) latestWeight.set(event.petId, event.amount);
		}
		pets = (petResult.data ?? []).map((pet) => ({ id: pet.id, name: pet.name, breed: pet.breed, birthday: pet.birthday ?? '', photo: pet.photo_url ?? undefined, weightKg: latestWeight.get(pet.id) ?? 0, allergies: pet.allergies, healthNotes: pet.health_notes }));
		petIndex = 0; savePets(pets);
		schedules = (scheduleResult.data ?? []).map((row) => ({ id: row.id, petId: row.pet_id, kind: row.kind, title: row.title, time: String(row.local_time).slice(0, 5), days: row.weekdays, enabled: row.is_active }));
		saveSchedules(schedules);
		if (familyChannel) void supabase.removeChannel(familyChannel);
		familyChannel = supabase.channel(`family:${familyId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_events', filter: `family_id=eq.${familyId}` }, (change) => {
			const row = change.new as { id: string; pet_id: string; kind: CareKind; occurred_at: string; author_id: string; actor_name: string; amount: number | null; unit: string | null; label: string | null; note: string | null };
			if (events.some((item) => item.id === row.id)) return;
			updateEvents([{ id: row.id, petId: row.pet_id, kind: row.kind, occurredAt: row.occurred_at, authorId: row.author_id, by: row.actor_name, amount: row.amount ? Number(row.amount) : undefined, unit: row.unit ?? undefined, label: row.label ?? undefined, note: row.note ?? undefined }, ...events]);
		}).subscribe();
	}
	async function setupFamily() {
		if (!supabase) return;
		const petName = familyPetName.trim();
		if (!familyName.trim() || !petName) { notify('Укажите название семьи и имя собаки'); return; }
		const { data, error } = await supabase.functions.invoke('create-family', { body: { name: familyName, pet: { name: petName, breed: familyPetBreed.trim() } } });
		if (error || !data?.familyId) { notify('Не удалось создать семейный профиль'); return; }
		await loadFamily(); settingsPanel = ''; notify('Семейный профиль создан');
	}
	async function createInvite() {
		if (!supabase || !familyId) return;
		const { data, error } = await supabase.functions.invoke('create-invite', { body: { familyId, email: inviteEmail || undefined } });
		if (error || !data?.token) { notify('Не удалось создать приглашение'); return; }
		inviteLink = `${location.origin}${base}/?invite=${data.token}`;
		try { await navigator.clipboard.writeText(inviteLink); notify('Ссылка скопирована · действует 7 дней'); }
		catch { notify('Приглашение готово — скопируйте ссылку'); }
	}
	async function acceptInvite() {
		const token = new URLSearchParams(location.search).get('invite');
		if (!token || !supabase) return;
		const { error } = await supabase.functions.invoke('accept-invite', { body: { token } });
		if (error) { authMessage = 'Приглашение недействительно, просрочено или уже использовано.'; return; }
		history.replaceState({}, '', `${location.pathname}${location.hash}`); await loadFamily(); notify('Вы присоединились к семье');
	}
	async function resetPassword() {
		if (!supabase || !authEmail) { authMessage = 'Сначала укажите адрес электронной почты.'; return; }
		const { error } = await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo: `${location.origin}${base}/` });
		authMessage = error ? 'Не удалось отправить письмо для сброса пароля.' : 'Если аккаунт найден, на почту придёт ссылка для сброса пароля.';
	}
	async function updatePassword() {
		if (!supabase || authPassword.length < 8) { authMessage = 'Новый пароль должен содержать не меньше восьми символов.'; return; }
		const { error } = await supabase.auth.updateUser({ password: authPassword });
		if (error) { authMessage = 'Не удалось изменить пароль. Запросите новую ссылку для сброса.'; return; }
		authPassword = ''; authMode = 'signin'; authMessage = 'Пароль изменён. Теперь войдите с ним.';
	}
	function rotatePet() { if (pets.length > 1) petIndex = (petIndex + 1) % pets.length; }
	async function removeEvent(event: CareEvent) {
		if (supabase && familyId) {
			if (familyRole !== 'owner') { notify('Записи семьи удаляет владелец'); return; }
			const { error } = await supabase.from('care_events').delete().eq('id', event.id);
			if (error) { notify('Не удалось удалить запись'); return; }
		}
		updateEvents(events.filter((row) => row.id !== event.id)); notify('Запись удалена');
	}
	function addPet() {
		if (supabase && familyId && familyRole !== 'owner') { notify('Профили собак меняет владелец семьи'); return; }
		const name = (document.querySelector<HTMLInputElement>('#pet-name')?.value ?? '').trim();
		if (!name) { notify('Укажите имя собаки'); return; }
		if (!isValidCareAmount('weight', petWeight)) { notify('Вес должен быть от 0,1 до 200 кг'); return; }
		if (petBirthday && (Number.isNaN(Date.parse(petBirthday)) || petBirthday > new Date().toLocaleDateString('en-CA'))) { notify('Дата рождения не может быть в будущем'); return; }
		const pet: Pet = { id: crypto.randomUUID(), name, breed: document.querySelector<HTMLInputElement>('#pet-breed')?.value.trim() || 'Порода не указана', birthday: petBirthday, weightKg: parseOptionalAmount(petWeight) ?? 0, allergies: petAllergies.trim(), healthNotes: petHealthNotes.trim() };
		if (supabase && familyId) {
			void supabase.from('pets').insert({ family_id: familyId, name: pet.name, breed: pet.breed, birthday: pet.birthday || null, allergies: pet.allergies, health_notes: pet.healthNotes }).select('id').single().then(({ data, error }) => {
				if (error || !data) { notify('Не удалось добавить собаку в семейный профиль'); return; }
				if (pet.weightKg) void supabase?.from('care_events').insert({ pet_id: data.id, family_id: familyId, kind: 'weight', amount: pet.weightKg, unit: 'кг', actor_name: member });
				pets = [...pets, { ...pet, id: data.id }]; savePets(pets); petIndex = pets.length - 1; settingsPanel = ''; notify('Профиль собаки добавлен');
			});
			return;
		}
		pets = [...pets, pet]; savePets(pets); petIndex = pets.length - 1; settingsPanel = ''; petBirthday = ''; petWeight = ''; petAllergies = ''; petHealthNotes = ''; notify('Профиль собаки добавлен');
	}
	async function removePet(petId: string) {
		if (supabase && familyId) {
			if (familyRole !== 'owner') { notify('Профили собак меняет владелец семьи'); return; }
			const { error } = await supabase.from('pets').delete().eq('id', petId);
			if (error) { notify('Не удалось удалить профиль'); return; }
		}
		pets = pets.filter((pet) => pet.id !== petId); events = events.filter((event) => event.petId !== petId); schedules = schedules.filter((item) => item.petId !== petId);
		savePets(pets); saveEvents(events); saveSchedules(schedules); petIndex = 0; notify('Профиль удалён');
	}
	function addSchedule() {
		if (supabase && familyId && familyRole !== 'owner') { notify('Расписание меняет владелец семьи'); return; }
		if (!activePet) return;
		if (!scheduleTitle.trim()) { notify('Укажите, о чём напомнить'); return; }
		if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) { notify('Укажите корректное время'); return; }
		const row: CareSchedule = { id: crypto.randomUUID(), petId: activePet.id, kind: scheduleKind, title: scheduleTitle.trim(), time: scheduleTime, days: [0,1,2,3,4,5,6], enabled: true };
		if (supabase && familyId) {
			void supabase.from('care_schedules').insert({ family_id: familyId, pet_id: row.petId, kind: row.kind, title: row.title, local_time: row.time, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, weekdays: row.days }).select('id').single().then(({ data, error }) => {
				if (error || !data) { notify('Не удалось сохранить напоминание'); return; }
				schedules = [...schedules, { ...row, id: data.id }]; saveSchedules(schedules); scheduleTitle = ''; notify('Напоминание добавлено');
			});
			return;
		}
		schedules = [...schedules, row]; saveSchedules(schedules); scheduleTitle = ''; notify('Напоминание добавлено');
	}
	async function toggleSchedule(id: string) {
		const schedule = schedules.find((item) => item.id === id);
		if (supabase && familyId && familyRole !== 'owner') { notify('Расписание меняет владелец семьи'); return; }
		if (supabase && familyId && schedule) {
			const { error } = await supabase.from('care_schedules').update({ is_active: !schedule.enabled }).eq('id', id);
			if (error) { notify('Не удалось обновить напоминание'); return; }
		}
		schedules = schedules.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item); saveSchedules(schedules);
	}
	function age(birthday: string) {
		if (!birthday) return 'новый друг'; const years = Math.floor((Date.now() - new Date(birthday).getTime()) / 31557600000); return years < 1 ? 'меньше года' : `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}`;
	}
	function timeOf(iso: string) { return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
	function dayOf(iso: string) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso)); }
	function playSound() {
		if (!soundEnabled) return;
		try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'sine'; osc.frequency.value = 670; gain.gain.setValueAtTime(0.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.13, ctx.currentTime + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.3); } catch { /* Audio is an optional delight. */ }
	}
	async function enablePush() {
		if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { notify('Push недоступен в этом браузере'); return; }
		if (!supabase || !isConfigured) { notify('Подключите Supabase и VAPID key в настройках проекта'); return; }
		const key = PUBLIC_VAPID_KEY;
		if (!key) { notify('Добавьте публичный VAPID key в настройки Pages'); return; }
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') { notify('Разрешение на уведомления не выдано'); return; }
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) });
			const { error } = await supabase.functions.invoke('register-push', { body: { subscription: subscription.toJSON() } });
			if (error) throw error; pushEnabled = true; notify('Уведомления включены для этого устройства');
		} catch { notify('Не удалось сохранить подписку. Проверьте настройки Supabase.'); }
	}
	async function disablePush() {
		if (!('serviceWorker' in navigator)) return;
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		if (!subscription) { pushEnabled = false; return; }
		if (supabase) {
			const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
			if (error) { notify('Не удалось отключить подписку на сервере'); return; }
		}
		await subscription.unsubscribe(); pushEnabled = false; notify('Уведомления отключены на этом устройстве');
	}
	async function authenticate() {
		if (!supabase) { authMessage = 'Чтобы включить аккаунты, добавьте Supabase URL и anon key в настройки проекта и пересоберите приложение.'; return; }
		if (authMode === 'signup') {
			const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { data: { display_name: member, username: authUsername }, emailRedirectTo: `${location.origin}${base}/` } });
			if (error) authMessage = error.message; else authMessage = 'Проверьте почту и подтвердите адрес. Затем вернитесь сюда для входа.';
			return;
		}
		if (authUsername) {
			const { data, error } = await supabase.functions.invoke('login-by-username', { body: { username: authUsername, password: authPassword } });
			if (error || !data?.session) { authMessage = 'Не удалось войти. Проверьте имя пользователя и пароль.'; return; }
			const { error: sessionError } = await supabase.auth.setSession(data.session);
			if (sessionError) { authMessage = 'Не удалось завершить вход.'; return; }
		} else {
			const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
			if (error) { authMessage = 'Не удалось войти. Проверьте адрес и пароль.'; return; }
		}
		const { data } = await supabase.auth.getUser(); cloudUser = data.user?.user_metadata.display_name || data.user?.email || '';
		currentUserId = data.user?.id ?? '';
		if (cloudUser) { member = cloudUser.split('@')[0]; localStorage.setItem('lapki:member', member); }
		settingsPanel = ''; authMessage = ''; await loadFamily(data.user?.id); await acceptInvite();
		if (!familyId && data.user?.user_metadata.username) {
			const { error } = await supabase.from('profiles').update({ username: data.user.user_metadata.username.toLowerCase(), display_name: data.user.user_metadata.display_name || member }).eq('user_id', data.user.id);
			if (error) notify('Аккаунт создан, но логин уже занят');
		}
		if (!familyId) { settingsPanel = 'profile'; familyPetName = ''; familyPetBreed = ''; }
		notify(familyId ? 'Вы вошли в семейный профиль' : 'Аккаунт готов — настройте семейный профиль');
	}
	async function oauth(provider: 'google' | 'custom:vk-id') {
		if (!supabase) { authMessage = 'Сначала подключите Supabase.'; return; }
		const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}${base}/` } });
		if (error) authMessage = 'Провайдер пока не настроен в Supabase.';
	}
	async function signOut() {
		if ('serviceWorker' in navigator) {
			try {
				const registration = await navigator.serviceWorker.ready;
				const subscription = await registration.pushManager.getSubscription();
				if (subscription) {
					const result = supabase ? await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint) : { error: null };
					const removed = await subscription.unsubscribe();
					pushEnabled = false;
					if (result.error || !removed) notify('Устройство отключено не полностью; проверьте подписку в настройках');
				}
			} catch { notify('Не удалось полностью отключить push-подписку'); }
		}
		await supabase?.auth.signOut();
		if (familyChannel && supabase) void supabase.removeChannel(familyChannel);
		familyChannel = null; cloudUser = ''; currentUserId = ''; familyId = ''; familyRole = ''; familyName = '';
		setDataScope('local'); pets = getPets(); events = getEvents(); schedules = getSchedules(); petIndex = 0; pushEnabled = false;
		notify('Вы вышли из аккаунта');
	}
	function exportData() {
		const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), pets, events, schedules }, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'lapki-backup.json'; a.click(); URL.revokeObjectURL(url); notify('Резервная копия скачана');
	}
	function importData() { fileInput?.click(); }
	async function readBackup(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0]; if (!file) return;
		try {
			const parsed: unknown = JSON.parse(await file.text());
			if (!isValidBackup(parsed)) throw new Error('Invalid backup');
			pets = parsed.pets; events = parsed.events; schedules = parsed.schedules; petIndex = 0;
			savePets(pets); saveEvents(events); saveSchedules(schedules); notify('Данные восстановлены');
		} catch { notify('Файл резервной копии не распознан'); }
		finally { input.value = ''; }
	}
</script>

<svelte:head>
	<title>Лапки — забота по очереди</title>
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
</svelte:head>

<div class:reduce-motion={reducedMotion} class="app-shell" data-ready={appReady}>
	<header class="topbar">
		<a class="brand" href={`${base}/`} aria-label="Лапки — на главную"><span class="brand-mark">⌁</span><span>лапки</span></a>
		<div class="top-date">{dateText}</div>
		<button class="avatar" aria-label="Открыть настройки" onclick={() => tab = 'settings'}>{member.slice(0,1).toUpperCase()}</button>
	</header>

	<main>
		{#if tab === 'home'}
			<div class="home-layout">
				<section class="welcome">
					<div class="welcome-copy">
						<p class="overline">ВАШ СЕМЕЙНЫЙ ДНЕВНИК</p>
						<h1>Привет,<br />семья <span>♥</span></h1>
						<p class="welcome-date">{dateText}</p>
					</div>
					<div class="pet-switch" aria-label="Выбранная собака">
						<div class="pet-initial">{activePet?.name.slice(0,1) ?? '🐾'}</div>
						<div><strong>{activePet?.name ?? 'Добавьте собаку'}</strong><span>{activePet?.breed} · {age(activePet?.birthday ?? '')}</span></div>
						{#if pets.length > 1}<button aria-label="Сменить собаку" onclick={rotatePet}>↗</button>{/if}
					</div>
				</section>

				<section class="bowl-feature" aria-label="Профиль собаки">
					{#if scene}<BowlScene />{:else}<div class="bowl-fallback big"><span>🥣</span><i>● ● ● ●</i></div>{/if}
					<div class="bowl-caption"><span>миска сегодня</span><strong>{meals.length} кормл. <i>·</i> {grams} г</strong></div>
				</section>

				<section class="quick-care" aria-labelledby="quick-title">
					<div class="section-heading"><div><p class="overline">МАЛЕНЬКИЕ ДЕЛА, БОЛЬШАЯ ЗАБОТА</p><h2 id="quick-title">Что сделали?</h2></div><span class="today-count">{meals.length} из 3 кормлений</span></div>
					<div class="care-buttons">
						{#each kindOptions as kind, i}
							<button class:featured={i === 0} class="care-button" aria-label={careLabels[kind]} onclick={() => openForm(kind)}>
								<span class="care-icon">{careIcons[kind]}</span><span>{careLabels[kind]}</span>{#if i === 0}<span class="shortcut">+</span>{/if}
							</button>
						{/each}
					</div>
				</section>

				<section class="today-feed" aria-labelledby="feed-title">
					<div class="section-heading"><div><p class="overline">СЕГОДНЯ</p><h2 id="feed-title">День {activePet?.name}</h2></div><button class="text-link" onclick={() => tab = 'history'}>Вся история ↗</button></div>
					{#if sortedEvents.length}
						<div class="timeline">
							{#each sortedEvents.slice(0, 4) as event}
								<div class="timeline-item"><span class="timeline-glyph">{careIcons[event.kind]}</span><div class="timeline-copy"><strong>{careLabels[event.kind]}{event.amount ? ` · ${event.amount} ${event.unit ?? ''}` : ''}</strong><span>{event.by}{event.label ? ` · ${event.label}` : ''}</span></div><time>{timeOf(event.occurredAt)}</time></div>
							{/each}
						</div>
					{:else}<div class="empty-line"><span>☀</span><p>День только начинается — отметьте первый момент заботы.</p></div>{/if}
				</section>
			</div>

			<aside class="side-column">
				<div class="care-note"><span class="note-star">✳</span><p class="overline">ОДНА НЕДЕЛЯ РЯДОМ</p><strong>{weekCount}<span> дел заботы</span></strong><p>Каждая отметка помогает всей семье быть на одной волне.</p></div>
				<div class="family-card"><div class="family-header"><div class="family-dots"><b>{member.slice(0,1).toUpperCase()}</b><b>+</b></div><button aria-label="Добавить участника" onclick={() => { tab = 'settings'; settingsPanel = 'auth'; }}>＋</button></div><h3>Свои рядом</h3><p>{cloudUser ? `Вы вошли как ${cloudUser}` : 'Подключите семью, чтобы вести общий дневник.'}</p><button class="invite-link" onclick={() => { tab = 'settings'; settingsPanel = cloudUser ? 'profile' : 'auth'; }}>{cloudUser ? 'Профиль семьи ↗' : 'Настроить семью ↗'}</button></div>
				<div class="reminder-card"><div class="reminder-mark">◷</div><div><span>СЛЕДУЮЩЕЕ</span><strong>{schedules.find((item) => item.enabled && item.petId === activePet?.id)?.title ?? 'Пока без напоминаний'}</strong><small>{schedules.find((item) => item.enabled && item.petId === activePet?.id)?.time ?? 'Добавьте расписание ухода'}</small></div><button aria-label="Открыть расписание" onclick={() => tab = 'schedule'}>↗</button></div>
			</aside>
		{:else if tab === 'history'}
			<section class="page-panel"><div class="page-title"><div><p class="overline">ПАМЯТЬ О ЗАБОТЕ</p><h1>История <em>{activePet?.name}</em></h1></div><span class="history-total">{sortedEvents.length} записей</span></div>
				{#if sortedEvents.length}<div class="history-list">{#each sortedEvents as event}<article class="history-row"><div class="history-icon">{careIcons[event.kind]}</div><div class="history-copy"><strong>{careLabels[event.kind]}{event.amount ? ` · ${event.amount} ${event.unit ?? ''}` : ''}</strong><p>{event.label ?? event.note ?? 'Без заметки'}</p><small>{event.by}</small></div><time><b>{timeOf(event.occurredAt)}</b><span>{dayOf(event.occurredAt)}</span></time>{#if !supabase || !familyId || familyRole === 'owner' || event.authorId === currentUserId}<button aria-label="Исправить запись" onclick={() => editEvent(event)}>✎</button>{/if}{#if !supabase || !familyId || familyRole === 'owner'}<button aria-label="Удалить запись" onclick={() => void removeEvent(event)}>×</button>{/if}</article>{/each}</div>{:else}<div class="empty-state"><span>⌁</span><h2>Тут появятся общие истории</h2><p>Отмечайте кормление, прогулку и другие маленькие дела.</p><button class="primary-button" onclick={() => tab = 'home'}>Отметить первое дело</button></div>{/if}
			</section>
		{:else if tab === 'schedule'}
			<section class="page-panel"><div class="page-title"><div><p class="overline">ЗАБОТА ВОВРЕМЯ</p><h1>Расписание <em>дел</em></h1></div></div><div class="schedule-compose"><div><label for="schedule-title">О чём напомнить</label><input id="schedule-title" bind:value={scheduleTitle} placeholder="Например, вечернее лекарство" disabled={Boolean(supabase && familyId && familyRole !== 'owner')} /></div><div><label for="schedule-kind">Тип заботы</label><select id="schedule-kind" bind:value={scheduleKind} disabled={Boolean(supabase && familyId && familyRole !== 'owner')}>{#each kindOptions as kind}<option value={kind}>{careLabels[kind]}</option>{/each}</select></div><div><label for="schedule-time">Время</label><input id="schedule-time" type="time" bind:value={scheduleTime} disabled={Boolean(supabase && familyId && familyRole !== 'owner')} /></div><button class="primary-button" onclick={addSchedule} disabled={!activePet || Boolean(supabase && familyId && familyRole !== 'owner')}>Добавить</button></div>{#if supabase && familyRole === 'member'}<p class="timezone-note">Напоминания в семье меняет её владелец.</p>{/if}
				{#if schedules.filter((row) => row.petId === activePet?.id).length}<div class="schedule-list">{#each schedules.filter((row) => row.petId === activePet?.id) as row}<article class:disabled={!row.enabled} class="schedule-row"><div class="schedule-symbol">{careIcons[row.kind]}</div><div><strong>{row.title}</strong><span>{careLabels[row.kind]} · каждый день</span></div><time>{row.time}</time><button role="switch" aria-checked={row.enabled} class:toggle-on={row.enabled} class="toggle" aria-label={row.title} onclick={() => toggleSchedule(row.id)}><i></i></button></article>{/each}</div>{:else}<div class="empty-line wide"><span>◷</span><p>Добавьте повторяющееся напоминание для кормления, лекарств или визита.</p></div>{/if}<p class="timezone-note">Время указано по часовому поясу этого устройства. Для push-напоминаний нужно подключить Supabase и VAPID.</p></section>
		{:else}
			<section class="page-panel settings-page"><div class="page-title"><div><p class="overline">ВСЁ ПО-ВАШЕМУ</p><h1>Настройки</h1></div><span class:cloud={!!cloudUser} class="mode-pill">{cloudUser ? '◉ синхронизация' : '○ на этом устройстве'}</span></div>
				<div class="settings-grid"><div class="settings-main">
						<section class="settings-block">
							<div class="settings-heading"><div><h2>{familyId ? familyName || 'Моя семья' : 'Моя семья'}</h2><p>{cloudUser ? `В аккаунте ${cloudUser}` : 'Дневник сейчас хранится только здесь.'}</p></div><span>⌂</span></div>
							{#if cloudUser}<button class="secondary-button" onclick={signOut}>Выйти из аккаунта</button>{:else}<button class="primary-button" onclick={() => settingsPanel = settingsPanel === 'auth' ? '' : 'auth'}>Войти или создать семью</button>{/if}
							{#if settingsPanel === 'auth'}
								<form class="auth-form" onsubmit={(event) => { event.preventDefault(); if (authMode === 'reset') void updatePassword(); else void authenticate(); }}>
									{#if authMode !== 'reset'}<div class="mode-switch"><button type="button" class:active={authMode === 'signin'} onclick={() => authMode = 'signin'}>Вход</button><button type="button" class:active={authMode === 'signup'} onclick={() => authMode = 'signup'}>Регистрация</button></div>{/if}
									{#if authMode === 'signup'}<label for="display-name">Как к вам обращаться</label><input id="display-name" bind:value={member} placeholder="Например, Аня" /><label for="username">Логин</label><input id="username" bind:value={authUsername} placeholder="Латиницей, от 3 символов" minlength="3" maxlength="32" pattern="[A-Za-z0-9_.-]&#123;3,32&#125;" required />{/if}
									{#if authMode === 'signin'}<label for="login-username">Имя пользователя <span>если входите по логину</span></label><input id="login-username" bind:value={authUsername} placeholder="Необязательно" maxlength="32" pattern="[A-Za-z0-9_.-]&#123;3,32&#125;" />{/if}
									{#if authMode !== 'reset'}<label for="auth-email">Email</label><input id="auth-email" type="email" bind:value={authEmail} placeholder="you@example.com" required={authMode === 'signup' || !authUsername} />{/if}
									<label for="auth-password">{authMode === 'reset' ? 'Новый пароль' : 'Пароль'}</label><input id="auth-password" type="password" bind:value={authPassword} minlength="8" required />
									<button class="primary-button" type="submit">{authMode === 'signup' ? 'Создать аккаунт' : authMode === 'reset' ? 'Сохранить новый пароль' : 'Войти'}</button>
									{#if authMode === 'signin'}<button class="quiet-button" type="button" onclick={() => void resetPassword()}>Не помню пароль</button>{/if}
									{#if authMode !== 'reset'}<div class="social-buttons"><button type="button" onclick={() => void oauth('google')}>Продолжить с Google</button><button type="button" onclick={() => void oauth('custom:vk-id')}>ВКонтакте</button></div>{/if}
									{#if authMessage}<p class="form-message">{authMessage}</p>{/if}{#if authMode !== 'reset'}<p class="fine-print">Подтверждение почты и сброс пароля отправляются через Supabase Auth.</p>{/if}
								</form>
							{/if}
							{#if cloudUser && !familyId}
								<div class="inline-form"><p>Создайте семейный профиль и добавьте первую собаку.</p><label for="family-name">Название семьи</label><input id="family-name" bind:value={familyName} placeholder="Например, Семья Ивановых" /><label for="family-pet-name">Имя собаки</label><input id="family-pet-name" bind:value={familyPetName} placeholder="Как зовут вашу собаку?" /><label for="family-pet-breed">Порода</label><input id="family-pet-breed" bind:value={familyPetBreed} placeholder="Порода" /><button class="primary-button" onclick={() => void setupFamily()}>Создать семейный профиль</button></div>
							{/if}
							{#if familyRole === 'owner'}<div class="inline-form"><label for="invite-email">Email участника <span>необязательно</span></label><input id="invite-email" type="email" bind:value={inviteEmail} placeholder="friend@example.com" /><button class="secondary-button" onclick={() => void createInvite()}>Создать ссылку-приглашение</button>{#if inviteLink}<label for="invite-link">Ссылка на 7 дней</label><input id="invite-link" readonly value={inviteLink} />{/if}</div>{/if}
						</section>
						<section class="settings-block"><div class="settings-heading"><div><h2>Собаки</h2><p>Профили, которые ведёт ваша семья</p></div><span>🐾</span></div>{#each pets as pet, i}<div class="pet-settings-row"><div class="pet-settings-avatar">{pet.name.slice(0,1)}</div><div><strong>{pet.name}</strong><span>{pet.breed} · {pet.weightKg ? `${pet.weightKg} кг` : 'вес не указан'}</span></div>{#if pets.length > 1 && (!familyId || familyRole === 'owner')}<button aria-label={`Удалить профиль ${pet.name}`} onclick={() => void removePet(pet.id)}>×</button>{/if}</div>{/each}{#if !familyId || familyRole === 'owner'}<button class="add-row" onclick={() => settingsPanel = settingsPanel === 'add-pet' ? '' : 'add-pet'}>＋ Добавить собаку</button>{#if settingsPanel === 'add-pet'}<div class="inline-form"><label for="pet-name">Имя</label><input id="pet-name" placeholder="Как зовут собаку?" /><label for="pet-breed">Порода</label><input id="pet-breed" placeholder="Порода" /><label for="pet-birthday">Дата рождения</label><input id="pet-birthday" type="date" bind:value={petBirthday} /><label for="pet-weight">Текущий вес</label><input id="pet-weight" type="number" min="0.1" max="200" step="0.1" bind:value={petWeight} placeholder="кг" /><label for="pet-allergies">Аллергии</label><input id="pet-allergies" bind:value={petAllergies} placeholder="Если есть" /><label for="pet-health">Заметки о здоровье</label><textarea id="pet-health" bind:value={petHealthNotes} rows="2" placeholder="Что важно помнить семье"></textarea><button class="primary-button" onclick={addPet}>Добавить профиль</button></div>{/if}{/if}</section>
						<section class="settings-block"><div class="settings-heading"><div><h2>Ваши напоминания</h2><p>{pushEnabled ? 'Уведомления включены на этом устройстве.' : 'Нужны для событий семьи и расписания.'}</p></div><span>♧</span></div><button class="secondary-button" onclick={() => pushEnabled ? void disablePush() : void enablePush()}>{pushEnabled ? 'Отключить уведомления' : 'Включить уведомления'}</button><p class="fine-print">На iPhone откройте сайт в Safari, добавьте его на экран «Домой» и включите уведомления внутри установленного PWA.</p></section>
					</div><aside class="settings-side"><section class="settings-block"><div class="settings-heading"><div><h2>Внешний вид</h2><p>Легко для глаз и устройства</p></div><span>◐</span></div><label class="setting-toggle"><span>3D-миска</span><input type="checkbox" bind:checked={scene} /><i></i></label><label class="setting-toggle"><span>Звук отметки</span><input type="checkbox" bind:checked={soundEnabled} onchange={() => localStorage.setItem('lapki:sound', String(soundEnabled))} /><i></i></label><label class="setting-toggle"><span>Уменьшить анимацию</span><input type="checkbox" bind:checked={reducedMotion} onchange={() => localStorage.setItem('lapki:reduced-motion', String(reducedMotion))} /><i></i></label></section><section class="settings-block"><div class="settings-heading"><div><h2>Копия данных</h2><p>Храните свои записи в безопасности</p></div><span>↧</span></div><button class="secondary-button" onclick={exportData}>Скачать резервную копию</button><button class="quiet-button" disabled={Boolean(supabase && familyId)} onclick={importData}>Восстановить из файла</button><input bind:this={fileInput} class="sr-only" type="file" accept="application/json" onchange={readBackup} /><p class="fine-print">{supabase && familyId ? 'Восстановление доступно в локальном режиме.' : 'На бесплатном тарифе Supabase нет автоматических резервных копий.'}</p></section><section class="settings-block info-block"><p class="overline">ПРИВАТНОСТЬ</p><p>Локальные данные остаются в этом браузере. Общий доступ появляется после подключения Supabase; записи защищены политиками доступа семьи.</p><a href="https://supabase.com/docs/guides/platform/free" target="_blank" rel="noreferrer">О бесплатном тарифе Supabase ↗</a></section></aside></div>
			</section>
		{/if}
	</main>

	<nav class="bottom-nav" aria-label="Основная навигация">
		<button class:active={tab === 'home'} aria-label="Главная" onclick={() => tab = 'home'}><span>⌂</span>Сегодня</button>
		<button class:active={tab === 'history'} aria-label="История" onclick={() => tab = 'history'}><span>≋</span>История</button>
		<button class:active={tab === 'schedule'} aria-label="Расписание" onclick={() => tab = 'schedule'}><span>◷</span>План</button>
		<button class:active={tab === 'settings'} aria-label="Настройки" onclick={() => tab = 'settings'}><span>◌</span>Моё</button>
	</nav>

	{#if sheetKind}
		<div class="sheet-backdrop">
			<div class="care-sheet" bind:this={careDialog} role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1" onkeydown={handleCareDialogKeydown}><div class="sheet-handle"></div><button class="sheet-close" aria-label="Закрыть" onclick={closeCareForm}>×</button><p class="overline">ОТМЕТКА ДЛЯ {activePet?.name.toUpperCase()}</p><h2 id="sheet-title">{careLabels[sheetKind]}</h2>
				{#if sheetKind === 'meal'}<label for="care-amount">Граммы корма</label><div class="amount-input"><input id="care-amount" type="number" min="1" max="5000" bind:value={amount} /><span>г</span></div><label for="care-label">Марка или тип корма</label><input id="care-label" bind:value={label} placeholder="Например, утренний корм" />
				{:else if sheetKind === 'walk'}<label for="care-amount">Длительность прогулки</label><div class="amount-input"><input id="care-amount" type="number" min="1" max="600" bind:value={amount} placeholder="30" /><span>мин</span></div><label for="care-label">Маршрут или занятие</label><input id="care-label" bind:value={label} placeholder="Например, парк" />
				{:else if sheetKind === 'medicine'}<label for="care-label">Лекарство и доза</label><input id="care-label" bind:value={label} placeholder="Название, доза" />
				{:else if sheetKind === 'weight'}<label for="care-amount">Вес</label><div class="amount-input"><input id="care-amount" type="number" min="0.1" max="200" step="0.1" bind:value={amount} placeholder="12.4" /><span>кг</span></div>
				{:else if sheetKind === 'vet' || sheetKind === 'vaccine'}<label for="care-label">Что записать</label><input id="care-label" bind:value={label} placeholder={sheetKind === 'vet' ? 'Осмотр, клиника' : 'Название прививки'} />
				{:else}<label for="care-label">Заметка о воде</label><input id="care-label" bind:value={label} placeholder="Например, сменил воду" />{/if}
				<label for="care-note">Заметка <span>необязательно</span></label><textarea id="care-note" bind:value={note} rows="2" placeholder="Что полезно знать семье?"></textarea><button class="primary-button save-care" onclick={() => { void saveCare(); playSound(); }}>{editingEventId ? 'Сохранить изменения' : 'Сохранить отметку'}</button>
			</div>
		</div>
	{/if}
	{#if toast}<div class="toast" role="status">{toast}</div>{/if}
</div>
