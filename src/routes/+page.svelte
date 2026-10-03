<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { base } from '$app/paths';
	import BowlScene from '$lib/BowlScene.svelte';
	import { addEvent, clearDataScope, flushPendingEvents, getEvents, getPendingEvents, getPendingPushEvents, getPets, getSchedules, isValidBackup, isValidCareAmount, legacyStarterPetId, mergePendingEvents, parseOptionalAmount, removePendingEvent, removePendingPushEvent, saveEvents, savePendingEvent, savePendingPushEvent, savePets, saveSchedules, setDataScope, todayMeals } from '$lib/store';
	import { careIcons, careLabels, type CareEvent, type CareKind, type CareSchedule, type Pet } from '$lib/types';
	import { supabaseClient } from '$lib/supabase';
	import { fetchAllPages } from '$lib/paginated-query';
	import { PUBLIC_VAPID_KEY } from '$env/static/public';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	type Tab = 'home' | 'history' | 'schedule' | 'settings';
	type FamilyContext = { userId: string; familyId: string; sessionVersion: number };
	let tab = $state<Tab>('home');
	let appReady = $state(false);
	let pets = $state<Pet[]>([]);
	let events = $state<CareEvent[]>([]);
	let schedules = $state<CareSchedule[]>([]);
	let petIndex = $state(0);
	let member = $state('Я');
	let sheetKind = $state<CareKind | null>(null);
	let editingEventId = $state('');
	let settingsPanel = $state<'profile' | 'add-pet' | 'edit-pet' | 'auth' | ''>('');
	let editingPetId = $state('');
	let toast = $state('');
	let familyLoadError = $state('');
	let familyLoadPending = $state(false);
	let exportingBackup = $state(false);
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
	let familyUserId = $state('');
	let familyName = $state('');
	let familyRole = $state<'owner' | 'member' | ''>('');
	let familyPetName = $state('');
	let familyPetBreed = $state('');
	let inviteLink = $state('');
	let inviteEmail = $state('');
	let familyChannel: RealtimeChannel | null = null;
	let familyRefreshTimer: ReturnType<typeof setTimeout>;
	let familyChangeVersion = 0;
	let familyLoadVersion = 0;
	let sessionVersion = 0;
	let pendingAuthSignOutVersion: number | null = null;
	let signedOutUserId = '';
	let pushStatusVersion = 0;
	let signOutPending = $state(false);
	let pushEnabled = $state(false);
	let soundEnabled = $state(false);
	let reducedMotion = $state(false);
	let scene = $state(true);
	let scheduleTitle = $state('');
	let scheduleTime = $state('08:00');
	let scheduleKind = $state<CareKind>('meal');
	let scheduleSaving = $state(false);
	let pendingScheduleRequest: { id: string; familyId: string; userId: string; petId: string } | null = null;
	let petBirthday = $state('');
	let petName = $state('');
	let petBreed = $state('');
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
	let legacyCareCount = $derived(events.filter((event) => event.petId === legacyStarterPetId).length);
	let legacyScheduleCount = $derived(schedules.filter((schedule) => schedule.petId === legacyStarterPetId).length);
	let sortedEvents = $derived([...events].filter((event) => event.petId === (activePet?.id ?? legacyStarterPetId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
	let weekCount = $derived(events.filter((event) => event.petId === activePet?.id && Date.now() - new Date(event.occurredAt).getTime() < 7 * 86400000).length);
	let dateText = $derived(new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));

	$effect(() => {
		if (sheetKind && careDialog) {
			careDialog.querySelector<HTMLInputElement>('input:not([type="file"]), textarea, select')?.focus();
		}
	});

	onMount(() => {
		setDataScope('local');
		const retryFamilySync = () => {
			if (supabase && currentUserId) void loadFamily(currentUserId);
		};
		window.addEventListener('online', retryFamilySync);
		member = localStorage.getItem('lapki:member') ?? 'Я';
		reducedMotion = localStorage.getItem('lapki:reduced-motion') === 'true';
		soundEnabled = localStorage.getItem('lapki:sound') === 'true';
		scene = localStorage.getItem('lapki:scene') !== 'false';
		if (supabase) {
			familyLoadPending = true;
			pets = getPets(); events = getEvents(); schedules = getSchedules();
			appReady = true;
			const authSessionVersion = sessionVersion;
			void supabase.auth.getUser().then(async ({ data }) => {
				if (authSessionVersion !== sessionVersion) return;
				if (!data.user) {
					familyLoadPending = false;
					pets = getPets(); events = getEvents(); schedules = getSchedules();
					return;
				}
				currentUserId = data.user.id;
				cloudUser = data.user.user_metadata.display_name || data.user.email || '';
				member = data.user.user_metadata.display_name || data.user.email?.split('@')[0] || member;
				if (await loadFamily(data.user.id) && new URLSearchParams(location.search).has('invite')) await acceptInvite();
				if (authSessionVersion === sessionVersion) void refreshPushStatus(sessionVersion);
			}).catch(() => {
				if (authSessionVersion !== sessionVersion) return;
				familyLoadPending = false;
				setDataScope('local');
				currentUserId = ''; cloudUser = ''; familyId = ''; familyUserId = ''; familyRole = ''; familyName = '';
				pets = getPets(); events = getEvents(); schedules = getSchedules();
				notify('Не удалось загрузить семейный профиль; показаны данные этого устройства');
			});
		} else {
			pets = getPets(); events = getEvents(); schedules = getSchedules();
			appReady = true;
		}
		void refreshPushStatus(sessionVersion);
		if (supabase) authListener = supabase.auth.onAuthStateChange((event, session) => {
			if (event === 'SIGNED_OUT') {
				sessionVersion += 1;
				const signOutVersion = sessionVersion;
				signedOutUserId = currentUserId;
				pendingAuthSignOutVersion = signOutVersion;
				familyLoadVersion += 1; familyLoadPending = Boolean(currentUserId);
				queueMicrotask(() => {
					if (sessionVersion !== signOutVersion || !currentUserId) return;
					pendingAuthSignOutVersion = null;
					clearCloudSession();
					void cleanupPushAfterSignOut(sessionVersion);
				});
			}
			if (event === 'SIGNED_IN' && session?.user && (session.user.id !== currentUserId || pendingAuthSignOutVersion !== null)) {
				sessionVersion += 1;
				pendingAuthSignOutVersion = null;
				familyLoadVersion += 1; familyLoadPending = true;
				queueMicrotask(() => {
					if (session.user.id === currentUserId && !familyLoadPending) return;
					const previousUserId = currentUserId || signedOutUserId;
					signedOutUserId = '';
					clearCloudSession();
					currentUserId = session.user.id;
					cloudUser = session.user.user_metadata.display_name || session.user.email || '';
					member = session.user.user_metadata.display_name || session.user.email?.split('@')[0] || member;
					localStorage.setItem('lapki:member', member);
					const pushCleanup = previousUserId && previousUserId !== session.user.id
						? cleanupPushForAccountChange(session.user.id)
						: Promise.resolve();
					void Promise.all([loadFamily(session.user.id), pushCleanup]).then(([loaded]) => {
						if (loaded) void refreshPushStatus(sessionVersion);
					}).catch(() => undefined);
				});
			}
			if (event === 'PASSWORD_RECOVERY') { navigateToTab('settings'); settingsPanel = 'auth'; authMode = 'reset'; authMessage = 'Введите новый пароль.'; }
		}).data.subscription;
		const query = new URLSearchParams(location.search);
		if (query.get('invite')) { navigateToTab('settings'); settingsPanel = 'auth'; authMessage = 'Войдите или создайте аккаунт, чтобы принять приглашение.'; }
		return () => {
			window.removeEventListener('online', retryFamilySync);
			if (familyChannel && supabase) void supabase.removeChannel(familyChannel);
			authListener?.unsubscribe();
			clearTimeout(toastTimer);
			clearTimeout(familyRefreshTimer);
		};
	});

	function notify(message: string) {
		toast = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => toast = '', 2800);
	}
	function navigateToTab(nextTab: 'home' | 'history' | 'schedule' | 'settings') {
		clearTimeout(toastTimer);
		toast = '';
		tab = nextTab;
	}
	function blockFamilyChanges() {
		if (!supabase || (!familyLoadPending && (!cloudUser || !familyLoadError))) return false;
		notify('Обновите семейные данные перед изменениями');
		return true;
	}
	function getFamilyContext(): FamilyContext { return { userId: currentUserId, familyId, sessionVersion }; }
	function isCurrentFamilyContext(context: FamilyContext) {
		return context.userId === currentUserId && context.familyId === familyId && context.sessionVersion === sessionVersion;
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
	function openForm(kind: CareKind) { rememberFocus(); editingEventId = ''; sheetKind = kind; amount = ''; label = ''; note = ''; }
	function editEvent(event: CareEvent) { rememberFocus(); editingEventId = event.id; sheetKind = event.kind; amount = event.amount?.toString() ?? ''; label = event.label ?? ''; note = event.note ?? ''; }
	async function saveCare() {
		if (!sheetKind || !activePet) return;
		if (blockFamilyChanges()) return;
		if (!isValidCareAmount(sheetKind, amount)) { notify('Проверьте допустимое количество'); return; }
		const savedAmount = parseOptionalAmount(amount);
		if (editingEventId) {
			const original = events.find((event) => event.id === editingEventId);
			if (!original) return;
			const context = getFamilyContext();
			const updated = { ...original, amount: savedAmount, unit: sheetKind === 'meal' ? 'г' : sheetKind === 'walk' ? 'мин' : sheetKind === 'weight' ? 'кг' : undefined, label: label.trim() || undefined, note: note.trim() || undefined };
			const isPending = getPendingEvents().some((event) => event.id === updated.id);
			if (supabase && familyId && !isPending) {
				const { data, error } = await supabase.from('care_events').update({ amount: updated.amount ?? null, unit: updated.unit ?? null, label: updated.label ?? null, note: updated.note ?? null }).eq('id', updated.id).select('id').maybeSingle();
				if (error || !data) { notify('Не удалось изменить эту запись'); return; }
			}
			if (!isCurrentFamilyContext(context)) return;
			if (isPending) savePendingEvent({ ...updated, authorId: original.authorId ?? context.userId });
			updateEvents(events.map((event) => event.id === updated.id ? updated : event));
			closeCareForm(); notify('Запись исправлена'); return;
		}
		const event = addEvent({ petId: activePet.id, kind: sheetKind, by: member, authorId: currentUserId || undefined, amount: savedAmount, unit: sheetKind === 'meal' ? 'г' : sheetKind === 'walk' ? 'мин' : sheetKind === 'weight' ? 'кг' : undefined, label: label.trim() || undefined, note: note.trim() || undefined });
		updateEvents(getEvents()); closeCareForm(); notify(`${careLabels[event.kind]} отмечено`);
		if (supabase && cloudUser) void syncEvent(event);
	}
	async function syncEvent(event: CareEvent) {
		if (!supabase || !familyId || !currentUserId) return;
		const context = getFamilyContext();
		const pendingEvent = { ...event, authorId: context.userId };
		savePendingEvent(pendingEvent);
		await syncPendingEvents(context, [pendingEvent]);
	}
	async function syncPendingEvents(context: FamilyContext, pendingEvents = getPendingEvents()) {
		if (!supabase || !context.familyId || !isCurrentFamilyContext(context)) return;
		const currentUserEvents = pendingEvents.filter((event) => event.authorId === context.userId);
		const syncResult = await flushPendingEvents(async (event) => {
			if (!isCurrentFamilyContext(context)) return 'deferred';
			const { error } = await supabase!.from('care_events').upsert({
				id: event.id,
				family_id: context.familyId,
				pet_id: event.petId,
				author_id: event.authorId ?? context.userId,
				kind: event.kind,
				occurred_at: event.occurredAt,
				actor_name: event.by,
				amount: event.amount ?? null,
				unit: event.unit ?? null,
				label: event.label ?? null,
				note: event.note ?? null
			}, { onConflict: 'id' });
			if (!isCurrentFamilyContext(context)) return 'deferred';
			if (error) return 'failed';
			savePendingPushEvent(event.id, event.authorId ?? context.userId);
			return 'confirmed';
		}, currentUserEvents);
		if (!isCurrentFamilyContext(context)) return;
		await syncPendingPushEvents(context);
		if (syncResult.failedCount > 0) notify('Запись сохранена на устройстве, синхронизация не удалась');
	}
	async function syncPendingPushEvents(context: FamilyContext) {
		if (!supabase || !context.familyId || !isCurrentFamilyContext(context)) return;
		let pushFailed = false;
		for (const pendingPushEvent of getPendingPushEvents()) {
			if (pendingPushEvent.authorId !== context.userId) continue;
			if (!isCurrentFamilyContext(context)) return;
			if (await sendEventPush(pendingPushEvent.eventId, context)) removePendingPushEvent(pendingPushEvent.eventId);
			else pushFailed = true;
		}
		if (pushFailed && isCurrentFamilyContext(context)) notify('Запись сохранена; уведомление семье пока не отправлено');
	}
	async function sendEventPush(eventId: string, context: FamilyContext) {
		if (!supabase) return false;
		for (let attempt = 0; attempt < 4; attempt++) {
			if (!isCurrentFamilyContext(context)) return false;
			const { error } = await supabase.functions.invoke('push-event', { body: { eventId } });
			if (!isCurrentFamilyContext(context)) return false;
			if (!error) return true;
			if (attempt < 3) {
				const response = error.context instanceof Response ? error.context : null;
				const retryAfter = Number(response?.headers.get('Retry-After'));
				await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : (attempt + 1) * 1500));
			}
		}
		return false;
	}
	async function loadFamily(userId = '') {
		if (!supabase) return true;
		const loadVersion = ++familyLoadVersion;
		const activeUserId = userId || currentUserId;
		const isCurrentLoad = () => loadVersion === familyLoadVersion && (!activeUserId || activeUserId === currentUserId);
		const finishFamilyLoad = (result: boolean) => {
			if (loadVersion === familyLoadVersion) familyLoadPending = false;
			return result;
		};
		familyLoadPending = true;
		familyLoadError = '';
		const previousFamilyId = familyId;
		const previousFamilyUserId = familyUserId;
		if (previousFamilyId && previousFamilyUserId !== activeUserId) {
			familyId = ''; familyUserId = ''; familyRole = ''; familyName = '';
			setDataScope(activeUserId ? `user:${activeUserId}` : 'local');
			pets = getPets(); events = getEvents(); schedules = getSchedules();
		}
		if (familyChannel) { void supabase.removeChannel(familyChannel); familyChannel = null; }
		const membershipResult = await Promise.resolve(supabase.from('family_members').select('family_id,role,families(name)').limit(1)).catch(() => null);
		if (!isCurrentLoad()) return finishFamilyLoad(false);
		if (!membershipResult || membershipResult.error) {
			if (previousFamilyId && previousFamilyUserId === activeUserId) {
				setDataScope(`family:${previousFamilyId}`);
				pets = getPets(); events = getEvents(); schedules = getSchedules();
			} else {
				familyId = ''; familyRole = ''; familyName = '';
				if (activeUserId) setDataScope(`user:${activeUserId}`);
				pets = getPets(); events = getEvents(); schedules = getSchedules();
			}
			familyLoadError = 'Не удалось проверить семейный профиль. Повторите загрузку.';
			return finishFamilyLoad(false);
		}
		const membership = membershipResult.data?.[0];
		if (!membership) {
			const revokedFamilyId = familyId;
			familyId = ''; familyRole = ''; familyName = ''; familyUserId = activeUserId;
			if (revokedFamilyId) clearDataScope(`family:${revokedFamilyId}`);
			if (activeUserId) setDataScope(`user:${activeUserId}`);
			pets = getPets(); events = getEvents(); schedules = getSchedules();
			if (revokedFamilyId) notify('Доступ к семье прекращён; её локальный кэш удалён');
			return finishFamilyLoad(true);
		}
		familyId = membership.family_id;
		familyUserId = activeUserId;
		familyRole = membership.role;
		setDataScope(`family:${familyId}`);
		familyName = (membership.families as { name?: string } | null)?.name ?? '';
		const results = await Promise.all([
			fetchAllPages((afterId, pageSize) => {
				let query = supabase.from('pets').select('id,name,breed,birthday,photo_url,allergies,health_notes').eq('family_id', familyId).order('id', { ascending: true });
				if (afterId) query = query.gt('id', afterId);
				return query.limit(pageSize);
			}),
			fetchAllPages((afterId, pageSize) => {
				let query = supabase.from('care_events').select('id,pet_id,kind,occurred_at,author_id,actor_name,amount,unit,label,note').eq('family_id', familyId).order('id', { ascending: true });
				if (afterId) query = query.gt('id', afterId);
				return query.limit(pageSize);
			}),
			fetchAllPages((afterId, pageSize) => {
				let query = supabase.from('care_schedules').select('id,pet_id,kind,title,local_time,weekdays,is_active').eq('family_id', familyId).order('id', { ascending: true });
				if (afterId) query = query.gt('id', afterId);
				return query.limit(pageSize);
			})
		]).catch(() => null);
		if (!isCurrentLoad()) return finishFamilyLoad(false);
		if (!results) {
			pets = getPets(); events = getEvents(); schedules = getSchedules();
			familyLoadError = 'Не удалось обновить семейные данные. Показана сохранённая копия; повторите загрузку.';
			return finishFamilyLoad(false);
		}
		const [petRows, eventRows, scheduleRows] = results;
		const serverEvents = eventRows.map((row) => ({ id: row.id, petId: row.pet_id, kind: row.kind, occurredAt: row.occurred_at, authorId: row.author_id, by: row.actor_name, amount: row.amount ? Number(row.amount) : undefined, unit: row.unit ?? undefined, label: row.label ?? undefined, note: row.note ?? undefined }));
		events = mergePendingEvents(serverEvents);
		saveEvents(events);
		const latestWeight = new Map<string, number>();
		for (const event of events) {
			if (event.kind === 'weight' && event.amount && !latestWeight.has(event.petId)) latestWeight.set(event.petId, event.amount);
		}
		pets = petRows.map((pet) => ({ id: pet.id, name: pet.name, breed: pet.breed, birthday: pet.birthday ?? '', photo: pet.photo_url ?? undefined, weightKg: latestWeight.get(pet.id) ?? 0, allergies: pet.allergies, healthNotes: pet.health_notes }));
		petIndex = 0; savePets(pets);
		schedules = scheduleRows.map((row) => ({ id: row.id, petId: row.pet_id, kind: row.kind, title: row.title, time: String(row.local_time).slice(0, 5), days: row.weekdays, enabled: row.is_active }));
		saveSchedules(schedules);
		const channelVersion = loadVersion;
		const channelFamilyId = familyId;
		if (familyChannel) void supabase.removeChannel(familyChannel);
		familyChannel = supabase.channel(`family:${familyId}`, { config: { private: true } })
			.on('broadcast', { event: '*' }, () => {
				if (familyLoadVersion !== channelVersion || familyId !== channelFamilyId) return;
				familyChangeVersion++;
				clearTimeout(familyRefreshTimer);
				familyRefreshTimer = setTimeout(() => void loadFamily(currentUserId), 150);
			})
			.subscribe();
		void syncPendingEvents(getFamilyContext());
		return finishFamilyLoad(true);
	}
	async function setupFamily() {
		if (!supabase) return;
		if (familyLoadPending) { notify('Дождитесь загрузки семейных данных'); return; }
		if (familyLoadError) { notify('Сначала обновите данные семьи'); return; }
		const context = getFamilyContext();
		const petName = familyPetName.trim();
		if (!familyName.trim() || !petName) { notify('Укажите название семьи и имя собаки'); return; }
		const { data, error } = await supabase.functions.invoke('create-family', { body: { name: familyName, pet: { name: petName, breed: familyPetBreed.trim() } } });
		if (!isCurrentFamilyContext(context)) return;
		if (error || !data?.familyId) { notify('Не удалось создать семейный профиль'); return; }
		if (!await loadFamily()) { notify('Профиль семьи создан, но данные не загрузились'); return; }
		settingsPanel = ''; notify('Семейный профиль создан');
	}
	async function createInvite() {
		if (!supabase || !familyId) return;
		const context = getFamilyContext();
		const { data, error } = await supabase.functions.invoke('create-invite', { body: { familyId, email: inviteEmail || undefined } });
		if (!isCurrentFamilyContext(context)) return;
		if (error || !data?.token) { notify('Не удалось создать приглашение'); return; }
		inviteLink = `${location.origin}${base}/?invite=${data.token}`;
		try { await navigator.clipboard.writeText(inviteLink); }
		catch { if (isCurrentFamilyContext(context)) notify('Приглашение готово — скопируйте ссылку'); return; }
		if (isCurrentFamilyContext(context)) notify('Ссылка скопирована · действует 7 дней');
	}
	async function acceptInvite() {
		const token = new URLSearchParams(location.search).get('invite');
		if (!token || !supabase) return;
		const context = getFamilyContext();
		const { error } = await supabase.functions.invoke('accept-invite', { body: { token } });
		if (!isCurrentFamilyContext(context)) return;
		if (error) { authMessage = 'Приглашение недействительно, просрочено или уже использовано.'; return; }
		history.replaceState({}, '', `${location.pathname}${location.hash}`);
		if (!await loadFamily()) { notify('Приглашение принято, но семейные данные не загрузились'); return; }
		notify('Вы присоединились к семье');
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
	function openPetSetup() {
		navigateToTab('settings');
		settingsPanel = cloudUser && !familyId ? '' : 'add-pet';
	}
	async function removeEvent(event: CareEvent) {
		if (blockFamilyChanges()) return;
		const context = getFamilyContext();
		if (supabase && familyId) {
			if (familyRole !== 'owner') { notify('Записи семьи удаляет владелец'); return; }
			const { data, error } = await supabase.from('care_events').delete().eq('id', event.id).select('id').maybeSingle();
			if (error || !data) { notify('Не удалось удалить запись'); return; }
		}
		if (!isCurrentFamilyContext(context)) return;
		updateEvents(events.filter((row) => row.id !== event.id)); notify('Запись удалена');
	}
	async function addPet() {
		if (supabase && familyId && familyRole !== 'owner') { notify('Профили собак меняет владелец семьи'); return; }
		if (blockFamilyChanges()) return;
		if (supabase && cloudUser && !familyId) { notify('Сначала создайте семейный профиль'); return; }
		const name = petName.trim();
		if (!name) { notify('Укажите имя собаки'); return; }
		if (!isValidCareAmount('weight', petWeight)) { notify('Вес должен быть от 0,1 до 200 кг'); return; }
		if (petBirthday && (Number.isNaN(Date.parse(petBirthday)) || petBirthday > new Date().toLocaleDateString('en-CA'))) { notify('Дата рождения не может быть в будущем'); return; }
		const petId = crypto.randomUUID();
		const pet: Pet = { id: petId, name, breed: petBreed.trim() || 'Порода не указана', birthday: petBirthday, weightKg: parseOptionalAmount(petWeight) ?? 0, allergies: petAllergies.trim(), healthNotes: petHealthNotes.trim() };
		if (supabase && familyId) {
			const context = getFamilyContext();
			const petResult = await Promise.resolve(supabase.from('pets').insert({ family_id: familyId, name: pet.name, breed: pet.breed, birthday: pet.birthday || null, allergies: pet.allergies, health_notes: pet.healthNotes }).select('id').single()).catch(() => null);
			if (!isCurrentFamilyContext(context)) return;
			if (!petResult || petResult.error || !petResult.data) { notify('Не удалось добавить собаку в семейный профиль'); return; }
			const { data } = petResult;
			let weightSaved = true;
			if (pet.weightKg) {
				const weightResult = await Promise.resolve(supabase.from('care_events').insert({ pet_id: data.id, family_id: familyId, kind: 'weight', amount: pet.weightKg, unit: 'кг', actor_name: member }).then(({ error }) => !error)).catch(() => false);
				if (!isCurrentFamilyContext(context)) return;
				weightSaved = weightResult;
			}
			const savedPet = { ...pet, id: data.id, weightKg: weightSaved ? pet.weightKg : 0 };
			pets = [...pets, savedPet]; savePets(pets); petIndex = pets.length - 1; settingsPanel = ''; petName = ''; petBreed = ''; petBirthday = ''; petWeight = ''; petAllergies = ''; petHealthNotes = '';
			notify(weightSaved ? 'Профиль собаки добавлен' : 'Профиль добавлен, но вес не сохранён. Запишите его в истории.');
			return;
		}
		if (pets.length === 0) {
			events = events.map((event) => event.petId === legacyStarterPetId ? { ...event, petId } : event);
			schedules = schedules.map((schedule) => schedule.petId === legacyStarterPetId ? { ...schedule, petId } : schedule);
			saveEvents(events); saveSchedules(schedules);
		}
		pets = [...pets, pet]; savePets(pets); petIndex = pets.length - 1; settingsPanel = ''; petName = ''; petBreed = ''; petBirthday = ''; petWeight = ''; petAllergies = ''; petHealthNotes = ''; notify('Профиль собаки добавлен');
	}
	function openPetEdit(pet: Pet) {
		editingPetId = pet.id;
		petName = pet.name;
		petBreed = pet.breed;
		petBirthday = pet.birthday;
		petWeight = pet.weightKg || '';
		petAllergies = pet.allergies;
		petHealthNotes = pet.healthNotes;
		settingsPanel = 'edit-pet';
	}
	async function savePetEdit() {
		if (blockFamilyChanges()) return;
		const pet = pets.find((item) => item.id === editingPetId);
		if (!pet) return;
		if (supabase && familyId && familyRole !== 'owner') { notify('Профили собак меняет владелец семьи'); return; }
		const name = petName.trim();
		if (!name) { notify('Укажите имя собаки'); return; }
		if (!isValidCareAmount('weight', petWeight)) { notify('Вес должен быть от 0,1 до 200 кг'); return; }
		if (petBirthday && (Number.isNaN(Date.parse(petBirthday)) || petBirthday > new Date().toLocaleDateString('en-CA'))) { notify('Дата рождения не может быть в будущем'); return; }
		const enteredWeight = parseOptionalAmount(petWeight);
		const updatedPet: Pet = {
			...pet,
			name,
			breed: petBreed.trim() || 'Порода не указана',
			birthday: petBirthday,
			weightKg: enteredWeight ?? pet.weightKg,
			allergies: petAllergies.trim(),
			healthNotes: petHealthNotes.trim()
		};
		if (supabase && familyId) {
			const context = getFamilyContext();
			const { data, error } = await supabase.from('pets').update({ name: updatedPet.name, breed: updatedPet.breed, birthday: updatedPet.birthday || null, allergies: updatedPet.allergies, health_notes: updatedPet.healthNotes }).eq('id', pet.id).select('id').maybeSingle();
			if (error || !data) { notify('Не удалось изменить профиль собаки'); return; }
			if (!isCurrentFamilyContext(context)) return;
		}
		pets = pets.map((item) => item.id === pet.id ? updatedPet : item);
		savePets(pets);
		if (enteredWeight && enteredWeight !== pet.weightKg) {
			const weightEvent = addEvent({ petId: pet.id, kind: 'weight', by: member, authorId: currentUserId || undefined, amount: enteredWeight, unit: 'кг', label: 'Вес профиля' });
			updateEvents(getEvents());
			if (supabase && cloudUser) void syncEvent(weightEvent);
		}
		editingPetId = '';
		settingsPanel = '';
		petName = ''; petBreed = ''; petBirthday = ''; petWeight = ''; petAllergies = ''; petHealthNotes = '';
		notify('Профиль собаки обновлён');
	}
	function transferLegacyData(petId: string) {
		if (cloudUser || familyId) return;
		const pet = pets.find((item) => item.id === petId);
		if (!pet) return;
		events = events.map((event) => event.petId === legacyStarterPetId ? { ...event, petId } : event);
		schedules = schedules.map((schedule) => schedule.petId === legacyStarterPetId ? { ...schedule, petId } : schedule);
		saveEvents(events);
		saveSchedules(schedules);
		petIndex = pets.findIndex((item) => item.id === petId);
		notify(`Старые данные привязаны к собаке ${pet.name}`);
	}
	async function removePet(petId: string) {
		if (blockFamilyChanges()) return;
		const context = getFamilyContext();
		if (supabase && familyId) {
			if (familyRole !== 'owner') { notify('Профили собак меняет владелец семьи'); return; }
			const { data, error } = await supabase.from('pets').delete().eq('id', petId).select('id').maybeSingle();
			if (error || !data) { notify('Не удалось удалить профиль'); return; }
		}
		if (!isCurrentFamilyContext(context)) return;
		pets = pets.filter((pet) => pet.id !== petId); events = events.filter((event) => event.petId !== petId); schedules = schedules.filter((item) => item.petId !== petId);
		savePets(pets); saveEvents(events); saveSchedules(schedules); petIndex = 0; notify('Профиль удалён');
	}
	async function addSchedule() {
		if (scheduleSaving) return;
		if (blockFamilyChanges()) return;
		if (supabase && familyId && familyRole !== 'owner') { notify('Расписание меняет владелец семьи'); return; }
		if (!activePet) return;
		if (!scheduleTitle.trim()) { notify('Укажите, о чём напомнить'); return; }
		if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleTime)) { notify('Укажите корректное время'); return; }
		const context = getFamilyContext();
		const scheduleTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const pendingRequest = pendingScheduleRequest?.familyId === familyId && pendingScheduleRequest.userId === context.userId && pendingScheduleRequest.petId === activePet.id ? pendingScheduleRequest : null;
		const row: CareSchedule = { id: pendingRequest?.id ?? crypto.randomUUID(), petId: activePet.id, kind: scheduleKind, title: scheduleTitle.trim(), time: scheduleTime, days: [0,1,2,3,4,5,6], enabled: true };
		if (supabase && familyId) {
			pendingScheduleRequest = { id: row.id, familyId, userId: context.userId, petId: row.petId };
			scheduleSaving = true;
			try {
				let { data, error } = await supabase.from('care_schedules').insert({ id: row.id, family_id: familyId, pet_id: row.petId, kind: row.kind, title: row.title, local_time: row.time, timezone: scheduleTimezone, weekdays: row.days }).select('id').single();
				if (error?.code === '23505') {
					const { data: existingSchedule, error: readError } = await supabase.from('care_schedules').select('family_id, pet_id, created_by, kind, title, local_time, timezone, weekdays').eq('id', row.id).maybeSingle();
					const sameOwner = existingSchedule && existingSchedule.family_id === familyId && existingSchedule.pet_id === row.petId && existingSchedule.created_by === context.userId;
					if (!readError && sameOwner) {
						const sameRequest = existingSchedule.kind === row.kind && existingSchedule.title === row.title && String(existingSchedule.local_time).slice(0, 5) === row.time && existingSchedule.timezone === scheduleTimezone && Array.isArray(existingSchedule.weekdays) && existingSchedule.weekdays.join(',') === row.days.join(',');
						if (sameRequest) { data = { id: row.id }; error = null; }
						else {
							const { data: updatedSchedule, error: updateError } = await supabase.from('care_schedules').update({ kind: row.kind, title: row.title, local_time: row.time, timezone: scheduleTimezone, weekdays: row.days }).eq('id', row.id).eq('family_id', familyId).select('id').maybeSingle();
							if (!updateError && updatedSchedule) { data = { id: updatedSchedule.id }; error = null; }
						}
					}
				}
				if (!isCurrentFamilyContext(context)) return;
				if (error || !data) { notify('Не удалось сохранить напоминание'); return; }
				pendingScheduleRequest = null;
				schedules = [...schedules.filter((item) => item.id !== data.id), { ...row, id: data.id }]; saveSchedules(schedules); scheduleTitle = ''; notify('Напоминание добавлено');
			} catch {
				if (isCurrentFamilyContext(context)) notify('Не удалось сохранить напоминание');
			} finally {
				scheduleSaving = false;
			}
			return;
		}
		schedules = [...schedules, row]; saveSchedules(schedules); scheduleTitle = ''; notify('Напоминание добавлено');
	}
	async function toggleSchedule(id: string) {
		if (blockFamilyChanges()) return;
		const context = getFamilyContext();
		const schedule = schedules.find((item) => item.id === id);
		if (supabase && familyId && familyRole !== 'owner') { notify('Расписание меняет владелец семьи'); return; }
		if (supabase && familyId && schedule) {
			const { data, error } = await supabase.from('care_schedules').update({ is_active: !schedule.enabled }).eq('id', id).select('id').maybeSingle();
			if (error || !data) { notify('Не удалось обновить напоминание'); return; }
		}
		if (!isCurrentFamilyContext(context)) return;
		schedules = schedules.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item); saveSchedules(schedules);
	}
	async function removeSchedule(id: string) {
		if (blockFamilyChanges()) return;
		const context = getFamilyContext();
		if (supabase && familyId && familyRole !== 'owner') { notify('Расписание меняет владелец семьи'); return; }
		if (supabase && familyId) {
			const { data, error } = await supabase.from('care_schedules').delete().eq('id', id).select('id').maybeSingle();
			if (error || !data) { notify('Не удалось удалить напоминание'); return; }
		}
		if (!isCurrentFamilyContext(context)) return;
		schedules = schedules.filter((item) => item.id !== id);
		saveSchedules(schedules);
		notify('Напоминание удалено');
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
		if (!cloudUser || !familyId) { notify('Сначала войдите в семейный профиль'); return; }
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
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (!subscription) { pushEnabled = false; return; }
			if (supabase) {
				const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
				if (error) { notify('Не удалось отключить подписку на сервере'); return; }
			}
			const removed = await subscription.unsubscribe();
			if (!removed) { notify('Не удалось отключить уведомления на устройстве'); return; }
			pushEnabled = false; notify('Уведомления отключены на этом устройстве');
		} catch { notify('Не удалось отключить уведомления на устройстве'); }
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
		settingsPanel = ''; authMessage = '';
		if (!await loadFamily(data.user?.id)) return;
		await acceptInvite();
		let profileSaveFailed = false;
		if (!familyId && data.user?.user_metadata.username) {
			const { error } = await supabase.from('profiles').update({ username: data.user.user_metadata.username.toLowerCase(), display_name: data.user.user_metadata.display_name || member }).eq('user_id', data.user.id);
			profileSaveFailed = Boolean(error);
		}
		if (!familyId) { settingsPanel = 'profile'; familyPetName = ''; familyPetBreed = ''; }
		notify(profileSaveFailed ? 'Аккаунт готов, но логин не удалось сохранить' : familyId ? 'Вы вошли в семейный профиль' : 'Аккаунт готов — настройте семейный профиль');
	}
	async function oauth(provider: 'google' | 'custom:vk-id') {
		if (!supabase) { authMessage = 'Сначала подключите Supabase.'; return; }
		const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}${base}/` } });
		if (error) authMessage = 'Провайдер пока не настроен в Supabase.';
	}
	function clearCloudSession() {
		sessionVersion += 1; familyLoadVersion += 1; familyLoadPending = false;
		if (familyChannel && supabase) void supabase.removeChannel(familyChannel);
		familyChannel = null; cloudUser = ''; currentUserId = ''; familyId = ''; familyUserId = ''; familyRole = ''; familyName = '';
		inviteLink = ''; inviteEmail = '';
		familyLoadError = ''; setDataScope('local'); pets = getPets(); events = getEvents(); schedules = getSchedules(); petIndex = 0;
	}
	async function refreshPushStatus(expectedSessionVersion: number) {
		const statusVersion = ++pushStatusVersion;
		if (!('serviceWorker' in navigator)) { if (statusVersion === pushStatusVersion && expectedSessionVersion === sessionVersion) pushEnabled = false; return; }
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (statusVersion === pushStatusVersion && expectedSessionVersion === sessionVersion) pushEnabled = Boolean(subscription);
		} catch { /* Push status is optional when the service worker is unavailable. */ }
	}
	async function cleanupPushAfterSignOut(expectedSessionVersion: number) {
		const statusVersion = ++pushStatusVersion;
		if (!('serviceWorker' in navigator)) { pushEnabled = false; return; }
		try {
			const registration = await navigator.serviceWorker.ready;
			if (sessionVersion !== expectedSessionVersion || currentUserId || statusVersion !== pushStatusVersion) return;
			const subscription = await registration.pushManager.getSubscription();
			if (sessionVersion !== expectedSessionVersion || currentUserId || statusVersion !== pushStatusVersion) return;
			if (!subscription) { pushEnabled = false; return; }
			const removed = await subscription.unsubscribe();
			if (sessionVersion !== expectedSessionVersion || currentUserId || statusVersion !== pushStatusVersion) return;
			pushEnabled = !removed;
			if (!removed) notify('Вы вышли, но push-подписка на этом устройстве осталась включена');
		} catch {
			if (sessionVersion !== expectedSessionVersion || currentUserId) return;
			pushEnabled = true;
			notify('Вы вышли, но состояние push-подписки на устройстве проверить не удалось');
		}
	}
	async function cleanupPushForAccountChange(expectedUserId: string) {
		const expectedSessionVersion = sessionVersion;
		const statusVersion = ++pushStatusVersion;
		if (!('serviceWorker' in navigator)) { if (currentUserId === expectedUserId) pushEnabled = false; return; }
		try {
			const registration = await navigator.serviceWorker.ready;
			if (sessionVersion !== expectedSessionVersion || currentUserId !== expectedUserId || statusVersion !== pushStatusVersion) return;
			const subscription = await registration.pushManager.getSubscription();
			if (sessionVersion !== expectedSessionVersion || currentUserId !== expectedUserId || statusVersion !== pushStatusVersion) return;
			if (!subscription) { if (currentUserId === expectedUserId) pushEnabled = false; return; }
			const removed = await subscription.unsubscribe();
			if (sessionVersion !== expectedSessionVersion || currentUserId !== expectedUserId || statusVersion !== pushStatusVersion) return;
			pushEnabled = !removed;
			if (!removed) notify('Аккаунт сменился, но push-подписка осталась включена');
		} catch {
			if (sessionVersion === expectedSessionVersion && currentUserId === expectedUserId && statusVersion === pushStatusVersion) {
				pushEnabled = true;
				notify('Аккаунт сменился, но состояние push-подписки проверить не удалось');
			}
		}
	}
	async function signOut() {
		if (signOutPending) return;
		signOutPending = true;
		const context = getFamilyContext();
		try {
		let pushCleanupFailed = false;
		if ('serviceWorker' in navigator) {
			try {
				const registration = await navigator.serviceWorker.ready;
				if (!isCurrentFamilyContext(context)) { notify('Сессия изменилась; выход не выполнялся'); return; }
				const subscription = await registration.pushManager.getSubscription();
				if (!isCurrentFamilyContext(context)) { notify('Сессия изменилась; выход не выполнялся'); return; }
				if (!subscription) pushEnabled = false;
				else {
					const result = supabase ? await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint) : { error: null };
					if (!isCurrentFamilyContext(context)) { notify('Сессия изменилась; выход не выполнялся'); return; }
					const removed = await subscription.unsubscribe();
					if (!isCurrentFamilyContext(context)) { notify('Сессия изменилась; выход не выполнялся'); return; }
					if (removed) pushEnabled = false;
					if (result.error || !removed) pushCleanupFailed = true;
				}
			} catch { pushCleanupFailed = true; }
		}
		if (!isCurrentFamilyContext(context)) { notify('Сессия изменилась; выход не выполнялся'); return; }
		if (supabase) {
			let signOutFailed = false;
			try { signOutFailed = Boolean((await supabase.auth.signOut()).error); }
			catch { signOutFailed = true; }
			if (!signOutFailed) {
				try {
					const { data, error } = await supabase.auth.getSession();
					if (error) { notify('Сессию завершили, но аккаунт не удалось перепроверить'); return; }
					if (data.session || (currentUserId && currentUserId !== context.userId)) {
						notify('Обнаружена активная сессия; её данные оставлены открытыми'); return;
					}
				} catch { notify('Сессию завершили, но аккаунт не удалось перепроверить'); return; }
			}
			if (signOutFailed) {
				let sessionStillActive = true;
				try {
					const { data, error: sessionError } = await supabase.auth.getSession();
					if (!isCurrentFamilyContext(context)) return;
					sessionStillActive = Boolean(data.session) || Boolean(sessionError);
				} catch { /* Keep the signed-in view when session state is unknown. */ }
				if (!sessionStillActive) {
					clearCloudSession();
					notify(pushCleanupFailed ? 'Вы вышли, но отключение push завершилось не полностью' : 'Сессия на устройстве завершена, сервер не подтвердил выход');
				} else {
					notify(pushCleanupFailed ? 'Не удалось выйти; отключение push завершилось не полностью' : 'Не удалось выйти из аккаунта');
				}
				return;
			}
		}
		clearCloudSession();
		notify(pushCleanupFailed ? 'Вы вышли, но отключение push завершилось не полностью' : 'Вы вышли из аккаунта');
		} finally {
			signOutPending = false;
		}
	}
	async function exportData() {
		if (exportingBackup) return;
		if (blockFamilyChanges()) return;
		const context = getFamilyContext();
		const backupFamilyId = familyId;
		const backupChangeVersion = familyChangeVersion;
		exportingBackup = true;
		try {
			let backupPets = pets;
			let backupEvents = mergePendingEvents(events);
			let backupSchedules = schedules;
			if (supabase && backupFamilyId) {
				const exportStartedAt = new Date().toISOString();
				const [petRows, eventRows, scheduleRows] = await Promise.all([
					fetchAllPages((afterId, pageSize) => {
						let query = supabase.from('pets').select('id,name,breed,birthday,photo_url,allergies,health_notes').eq('family_id', backupFamilyId).lte('created_at', exportStartedAt).order('id', { ascending: true });
						if (afterId) query = query.gt('id', afterId);
						return query.limit(pageSize);
					}),
					fetchAllPages((afterId, pageSize) => {
						let query = supabase.from('care_events').select('id,pet_id,kind,occurred_at,author_id,actor_name,amount,unit,label,note').eq('family_id', backupFamilyId).lte('created_at', exportStartedAt).order('id', { ascending: true });
						if (afterId) query = query.gt('id', afterId);
						return query.limit(pageSize);
					}),
					fetchAllPages((afterId, pageSize) => {
						let query = supabase.from('care_schedules').select('id,pet_id,kind,title,local_time,weekdays,is_active').eq('family_id', backupFamilyId).lte('created_at', exportStartedAt).order('id', { ascending: true });
						if (afterId) query = query.gt('id', afterId);
						return query.limit(pageSize);
					})
				]);
				if (!isCurrentFamilyContext(context) || familyId !== backupFamilyId || familyChangeVersion !== backupChangeVersion) {
					notify('Создание копии отменено после смены семейного профиля');
					return;
				}
				backupEvents = mergePendingEvents(eventRows.map((row) => ({ id: row.id, petId: row.pet_id, kind: row.kind, occurredAt: row.occurred_at, authorId: row.author_id, by: row.actor_name, amount: row.amount ? Number(row.amount) : undefined, unit: row.unit ?? undefined, label: row.label ?? undefined, note: row.note ?? undefined })));
				const latestWeight = new Map<string, number>();
				for (const event of backupEvents) {
					if (event.kind === 'weight' && event.amount && !latestWeight.has(event.petId)) latestWeight.set(event.petId, event.amount);
				}
				backupPets = petRows.map((pet) => ({ id: pet.id, name: pet.name, breed: pet.breed, birthday: pet.birthday ?? '', photo: pet.photo_url ?? undefined, weightKg: latestWeight.get(pet.id) ?? 0, allergies: pet.allergies, healthNotes: pet.health_notes }));
				backupSchedules = scheduleRows.map((row) => ({ id: row.id, petId: row.pet_id, kind: row.kind, title: row.title, time: String(row.local_time).slice(0, 5), days: row.weekdays, enabled: row.is_active }));
			} else if (!isCurrentFamilyContext(context)) {
				notify('Создание копии отменено после смены профиля');
				return;
			}
			const backup = { exportedAt: new Date().toISOString(), pets: backupPets, events: backupEvents, schedules: backupSchedules };
			if (!isValidBackup(backup)) {
				notify('Копия не скачана: проверьте, что все записи относятся к сохранённым собакам');
				return;
			}
			const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = 'lapki-backup.json';
			link.click();
			URL.revokeObjectURL(url);
			notify('Полная резервная копия скачана');
		} catch {
			notify('Не удалось загрузить все данные для резервной копии. Повторите попытку.');
		} finally {
			exportingBackup = false;
		}
	}
	function importData() { fileInput?.click(); }
	async function readBackup(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0]; if (!file) return;
		if (cloudUser) { input.value = ''; notify('Для восстановления выйдите в локальный режим'); return; }
		if (blockFamilyChanges()) { input.value = ''; return; }
		const context = getFamilyContext();
		try {
			const parsed: unknown = JSON.parse(await file.text());
			if (cloudUser || !isCurrentFamilyContext(context) || familyLoadPending) { notify('Восстановление отменено после смены сессии'); return; }
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
		<button class="avatar" aria-label="Открыть настройки" onclick={() => navigateToTab('settings')}>{member.slice(0,1).toUpperCase()}</button>
	</header>
	{#if familyLoadError || familyLoadPending}<div class="cloud-error" role={familyLoadError ? 'alert' : 'status'}><p>{familyLoadError || 'Проверяем семейный профиль…'}</p><button class="quiet-button" disabled={familyLoadPending} onclick={() => void loadFamily(currentUserId)}>{familyLoadPending ? 'Загружаем…' : 'Повторить загрузку'}</button></div>{/if}

	<main>
		{#if !appReady}
			<section class="page-panel" role="status">Загружаем семейный дневник…</section>
		{:else if tab === 'home'}
			{#if !activePet}
				<section class="page-panel"><div class="empty-state"><span>🐾</span><h2>Добавьте профиль собаки</h2><p>{familyRole === 'member' ? 'В семейном профиле пока нет собаки. Попросите владельца добавить её.' : cloudUser ? 'Настройте семейный профиль и добавьте первую собаку.' : legacyCareCount || legacyScheduleCount ? `Сохранено записей: ${legacyCareCount}, напоминаний: ${legacyScheduleCount}. Они сохранятся после добавления профиля.` : 'Укажите имя собаки, чтобы начать семейный дневник ухода.'}</p>
					{#if familyRole !== 'member'}<button class="primary-button" onclick={openPetSetup}>{cloudUser ? 'Создать семейный профиль' : 'Добавить собаку'}</button>{/if}
					{#if !cloudUser && supabase}<button class="secondary-button" onclick={() => { navigateToTab('settings'); settingsPanel = 'auth'; }}>Войти или создать семью</button>{/if}
				</div></section>
			{:else}
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
					{#if !cloudUser && !familyId && (legacyCareCount || legacyScheduleCount)}
						<div class="legacy-transfer" role="note">
							<p>В старом стартовом профиле осталось записей: {legacyCareCount}, напоминаний: {legacyScheduleCount}.</p>
							<button class="secondary-button" onclick={() => navigateToTab('settings')}>Выбрать собаку для переноса</button>
						</div>
					{/if}
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
					<div class="section-heading"><div><p class="overline">СЕГОДНЯ</p><h2 id="feed-title">День {activePet?.name}</h2></div><button class="text-link" onclick={() => navigateToTab('history')}>Вся история ↗</button></div>
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
				<div class="family-card"><div class="family-header">{#if familyId}<div class="family-dots"><b>{member.slice(0,1).toUpperCase()}</b>{#if familyRole === 'owner'}<b>+</b>{/if}</div>{:else}<span class="overline">НА ЭТОМ УСТРОЙСТВЕ</span>{/if}{#if familyRole === 'owner'}<button aria-label="Добавить участника" onclick={() => { navigateToTab('settings'); settingsPanel = 'profile'; }}>＋</button>{/if}</div><h3>{familyId ? 'Свои рядом' : 'Дневник ухода'}</h3><p>{familyId ? `Общий профиль${familyName ? ` · ${familyName}` : ''}` : cloudUser ? 'Создайте семейный профиль для синхронизации.' : 'Записи пока сохранены только в этом браузере.'}</p><button class="invite-link" onclick={() => { navigateToTab('settings'); settingsPanel = cloudUser ? 'profile' : 'auth'; }}>{familyRole === 'owner' ? 'Пригласить участника ↗' : familyId ? 'Настроить профиль семьи ↗' : cloudUser ? 'Создать семейный профиль ↗' : 'Подключить семью ↗'}</button></div>
				<div class="reminder-card"><div class="reminder-mark">◷</div><div><span>СЛЕДУЮЩЕЕ</span><strong>{schedules.find((item) => item.enabled && item.petId === activePet?.id)?.title ?? 'Пока без напоминаний'}</strong><small>{schedules.find((item) => item.enabled && item.petId === activePet?.id)?.time ?? 'Добавьте расписание ухода'}</small></div><button aria-label="Открыть расписание" onclick={() => navigateToTab('schedule')}>↗</button></div>
			</aside>
			{/if}
		{:else if tab === 'history'}
			<section class="page-panel"><div class="page-title"><div><p class="overline">ПАМЯТЬ О ЗАБОТЕ</p><h1>История <em>{activePet?.name ?? 'ухода'}</em></h1></div><span class="history-total">{sortedEvents.length} записей</span></div>
				{#if !activePet && sortedEvents.length}<p class="fine-print">Эти записи сохранены из прежнего стартового профиля. Они останутся в журнале и привяжутся к собаке после добавления профиля.</p>{/if}
				{#if sortedEvents.length}<div class="history-list">{#each sortedEvents as event}<article class="history-row"><div class="history-icon">{careIcons[event.kind]}</div><div class="history-copy"><strong>{careLabels[event.kind]}{event.amount ? ` · ${event.amount} ${event.unit ?? ''}` : ''}</strong><p>{event.label ?? event.note ?? 'Без заметки'}</p><small>{event.by}</small></div><time><b>{timeOf(event.occurredAt)}</b><span>{dayOf(event.occurredAt)}</span></time>{#if activePet && (!supabase || !familyId || familyRole === 'owner' || event.authorId === currentUserId)}<button aria-label="Исправить запись" onclick={() => editEvent(event)}>✎</button>{/if}{#if activePet && (!supabase || !familyId || familyRole === 'owner')}<button aria-label="Удалить запись" onclick={() => void removeEvent(event)}>×</button>{/if}</article>{/each}</div>{:else}<div class="empty-state"><span>⌁</span><h2>{activePet ? 'Тут появятся записи об уходе' : 'Добавьте профиль собаки'}</h2><p>{activePet ? 'Отмечайте кормление, прогулку и другие маленькие дела.' : 'Создайте профиль, чтобы начать дневник ухода.'}</p>{#if activePet}<button class="primary-button" onclick={() => openForm('meal')}>Отметить кормление</button>{:else if familyRole !== 'member'}<button class="primary-button" onclick={openPetSetup}>Добавить собаку</button>{/if}</div>{/if}
			</section>
		{:else if tab === 'schedule'}
			<section class="page-panel"><div class="page-title"><div><p class="overline">ЗАБОТА ВОВРЕМЯ</p><h1>Расписание <em>дел</em></h1></div></div>
				{#if activePet}<div class="schedule-compose"><div><label for="schedule-title">О чём напомнить</label><input id="schedule-title" bind:value={scheduleTitle} maxlength="80" placeholder="Например, вечернее лекарство" disabled={scheduleSaving || Boolean(supabase && familyId && familyRole !== 'owner')} /></div><div><label for="schedule-kind">Тип заботы</label><select id="schedule-kind" bind:value={scheduleKind} disabled={scheduleSaving || Boolean(supabase && familyId && familyRole !== 'owner')}>{#each kindOptions as kind}<option value={kind}>{careLabels[kind]}</option>{/each}</select></div><div><label for="schedule-time">Время</label><input id="schedule-time" type="time" bind:value={scheduleTime} disabled={scheduleSaving || Boolean(supabase && familyId && familyRole !== 'owner')} /></div><button class="primary-button" onclick={addSchedule} disabled={scheduleSaving || Boolean(supabase && familyId && familyRole !== 'owner')}>{scheduleSaving ? 'Сохраняем…' : 'Добавить'}</button></div>{#if supabase && familyRole === 'member'}<p class="timezone-note">Напоминания в семье меняет её владелец.</p>{/if}
				{#if schedules.filter((row) => row.petId === activePet?.id).length}
					<div class="schedule-list">
						{#each schedules.filter((row) => row.petId === activePet?.id) as row}
							<article class:disabled={!row.enabled} class="schedule-row">
								<div class="schedule-symbol">{careIcons[row.kind]}</div>
								<div><strong>{row.title}</strong><span>{careLabels[row.kind]} · каждый день</span></div>
								<time>{row.time}</time>
								<button role="switch" aria-checked={row.enabled} class:toggle-on={row.enabled} class="toggle" aria-label={row.enabled ? `Выключить: ${row.title}` : `Включить: ${row.title}`} disabled={Boolean(supabase && familyId && familyRole !== 'owner')} onclick={() => void toggleSchedule(row.id)}><i></i></button>
								{#if !supabase || !familyId || familyRole === 'owner'}<button class="schedule-delete" aria-label={`Удалить напоминание: ${row.title}`} onclick={() => void removeSchedule(row.id)}>×</button>{/if}
							</article>
						{/each}
					</div>
				{:else}<div class="empty-line wide"><span>◷</span><p>Добавьте повторяющееся напоминание для кормления, лекарств или визита.</p></div>{/if}<p class="timezone-note">Время указано по часовому поясу этого устройства. Для push-напоминаний нужно подключить Supabase и VAPID.</p>
				{:else}<div class="empty-state"><span>◷</span><h2>Сначала добавьте собаку</h2><p>{legacyScheduleCount ? `Сохранено напоминаний: ${legacyScheduleCount}. Они останутся и привяжутся к собаке после добавления профиля.` : 'Расписание ухода будет привязано к профилю собаки.'}</p>{#if familyRole !== 'member'}<button class="primary-button" onclick={openPetSetup}>Добавить собаку</button>{/if}</div>{/if}
			</section>
		{:else}
			<section class="page-panel settings-page"><div class="page-title"><div><p class="overline">ВСЁ ПО-ВАШЕМУ</p><h1>Настройки</h1></div><span class:cloud={!!cloudUser} class="mode-pill">{cloudUser ? '◉ синхронизация' : '○ на этом устройстве'}</span></div>
				<div class="settings-grid"><div class="settings-main">
						<section class="settings-block">
							<div class="settings-heading"><div><h2>{familyId ? familyName || 'Моя семья' : 'Моя семья'}</h2><p>{cloudUser ? `В аккаунте ${cloudUser}` : 'Дневник сейчас хранится только здесь.'}</p></div><span>⌂</span></div>
							{#if cloudUser}<button class="secondary-button" disabled={signOutPending} onclick={signOut}>{signOutPending ? 'Выходим…' : 'Выйти из аккаунта'}</button>{:else if supabase}<button class="primary-button" onclick={() => settingsPanel = settingsPanel === 'auth' ? '' : 'auth'}>Войти или создать семью</button>{:else}<p class="fine-print">Семейный вход появится после подключения Supabase. Инструкция — в README репозитория.</p>{/if}
							{#if settingsPanel === 'auth' && supabase}
								<form class="auth-form" onsubmit={(event) => { event.preventDefault(); if (authMode === 'reset') void updatePassword(); else void authenticate(); }}>
									{#if authMode !== 'reset'}<div class="mode-switch"><button type="button" aria-pressed={authMode === 'signin'} class:active={authMode === 'signin'} onclick={() => authMode = 'signin'}>Вход</button><button type="button" aria-pressed={authMode === 'signup'} class:active={authMode === 'signup'} onclick={() => authMode = 'signup'}>Регистрация</button></div>{/if}
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
						<section class="settings-block">
							<div class="settings-heading"><div><h2>Собаки</h2><p>Профили, которые ведёт ваша семья</p></div><span>🐾</span></div>
							{#each pets as pet}
								<div class="pet-settings-row">
									<div class="pet-initial">{pet.name.slice(0,1)}</div>
									<div><strong>{pet.name}</strong><span>{pet.breed} · {pet.weightKg ? `${pet.weightKg} кг` : 'вес не указан'}</span></div>
									{#if !cloudUser || familyRole === 'owner'}
										<button aria-label={`Изменить профиль ${pet.name}`} onclick={() => openPetEdit(pet)}>✎</button>
										{#if pets.length > 1}<button aria-label={`Удалить профиль ${pet.name}`} onclick={() => void removePet(pet.id)}>×</button>{/if}
									{/if}
								</div>
							{/each}
							{#if !cloudUser && !familyId && (legacyCareCount || legacyScheduleCount)}
								<div class="legacy-transfer">
									<p>Старые записи: {legacyCareCount} · напоминания: {legacyScheduleCount}. Выберите собаку, к которой их привязать.</p>
									{#each pets as pet}<button class="secondary-button" onclick={() => transferLegacyData(pet.id)}>Перенести данные к {pet.name}</button>{/each}
								</div>
							{/if}
							{#if !cloudUser || familyRole === 'owner'}
								<button class="add-row" onclick={() => {
									if (settingsPanel !== 'add-pet') {
										editingPetId = ''; petName = ''; petBreed = ''; petBirthday = ''; petWeight = ''; petAllergies = ''; petHealthNotes = '';
									}
									settingsPanel = settingsPanel === 'add-pet' ? '' : 'add-pet';
								}}>＋ Добавить собаку</button>
								{#if settingsPanel === 'add-pet' || settingsPanel === 'edit-pet'}
									<div class="inline-form">
										{#if editingPetId}<h3>Профиль: {pets.find((pet) => pet.id === editingPetId)?.name}</h3>{/if}
										<label for="pet-name">Имя</label><input id="pet-name" bind:value={petName} maxlength="80" placeholder="Как зовут собаку?" />
										<label for="pet-breed">Порода</label><input id="pet-breed" bind:value={petBreed} maxlength="100" placeholder="Порода" />
										<label for="pet-birthday">Дата рождения</label><input id="pet-birthday" type="date" bind:value={petBirthday} />
										<label for="pet-weight">Вес, кг</label><input id="pet-weight" type="number" min="0.1" max="200" step="0.1" bind:value={petWeight} placeholder="кг" />
										<label for="pet-allergies">Аллергии</label><input id="pet-allergies" bind:value={petAllergies} maxlength="500" placeholder="Если есть" />
										<label for="pet-health">Заметки о здоровье</label><textarea id="pet-health" bind:value={petHealthNotes} maxlength="2000" rows="2" placeholder="Что важно помнить семье"></textarea>
										{#if editingPetId}<p class="fine-print">Новый вес добавится отдельной записью. Пустое поле не удаляет старые измерения.</p><button class="primary-button" onclick={() => void savePetEdit()}>Сохранить изменения</button>{:else}<button class="primary-button" onclick={addPet}>Добавить профиль</button>{/if}
										{#if editingPetId}<button class="quiet-button" onclick={() => { editingPetId = ''; settingsPanel = ''; }}>Отмена</button>{/if}
									</div>
								{/if}
							{/if}
						</section>
						<section class="settings-block"><div class="settings-heading"><div><h2>Ваши напоминания</h2><p>{pushEnabled ? 'Уведомления включены на этом устройстве.' : 'Нужны для событий семьи и расписания.'}</p></div><span>♧</span></div>{#if isConfigured}{#if familyId}<button class="secondary-button" onclick={() => pushEnabled ? void disablePush() : void enablePush()}>{pushEnabled ? 'Отключить уведомления' : 'Включить уведомления'}</button>{:else}<button class="secondary-button" onclick={() => { navigateToTab('settings'); settingsPanel = cloudUser ? 'profile' : 'auth'; }}>{cloudUser ? 'Создать семейный профиль' : 'Войти в семейный профиль'}</button>{/if}{:else}<p class="fine-print">Push пока не настроен. Нужны проект Supabase и ключ VAPID; шаги есть в README репозитория.</p>{/if}<p class="fine-print">На iPhone откройте сайт в Safari, добавьте его на экран «Домой» и включите уведомления внутри установленного PWA.</p></section>
					</div><aside class="settings-side"><section class="settings-block"><div class="settings-heading"><div><h2>Внешний вид</h2><p>Легко для глаз и устройства</p></div><span>◐</span></div><label class="setting-toggle"><span>3D-миска</span><input type="checkbox" bind:checked={scene} onchange={() => localStorage.setItem('lapki:scene', String(scene))} /><i></i></label><label class="setting-toggle"><span>Звук отметки</span><input type="checkbox" bind:checked={soundEnabled} onchange={() => localStorage.setItem('lapki:sound', String(soundEnabled))} /><i></i></label><label class="setting-toggle"><span>Уменьшить анимацию</span><input type="checkbox" bind:checked={reducedMotion} onchange={() => localStorage.setItem('lapki:reduced-motion', String(reducedMotion))} /><i></i></label></section><section class="settings-block"><div class="settings-heading"><div><h2>Копия данных</h2><p>Храните свои записи в безопасности</p></div><span>↧</span></div><button class="secondary-button" disabled={exportingBackup} onclick={exportData}>{exportingBackup ? 'Готовим копию…' : 'Скачать резервную копию'}</button><button class="quiet-button" disabled={Boolean(cloudUser)} onclick={importData}>Восстановить из файла</button><input bind:this={fileInput} class="sr-only" type="file" accept="application/json" onchange={readBackup} /><p class="fine-print">{cloudUser ? 'Для восстановления выйдите в локальный режим.' : 'На бесплатном тарифе Supabase нет автоматических резервных копий.'}</p></section><section class="settings-block info-block"><p class="overline">ПРИВАТНОСТЬ</p><p>Локальные данные остаются в этом браузере. Общий доступ появляется после подключения Supabase; записи защищены политиками доступа семьи.</p><a href="https://supabase.com/docs/guides/platform/free" target="_blank" rel="noreferrer">О бесплатном тарифе Supabase ↗</a></section></aside></div>
			</section>
		{/if}
	</main>

	<nav class="bottom-nav" aria-label="Основная навигация">
		<button class:active={tab === 'home'} aria-pressed={tab === 'home'} aria-label="Главная" onclick={() => navigateToTab('home')}><span>⌂</span>Сегодня</button>
		<button class:active={tab === 'history'} aria-pressed={tab === 'history'} aria-label="История" onclick={() => navigateToTab('history')}><span>≋</span>История</button>
		<button class:active={tab === 'schedule'} aria-pressed={tab === 'schedule'} aria-label="Расписание" onclick={() => navigateToTab('schedule')}><span>◷</span>План</button>
		<button class:active={tab === 'settings'} aria-pressed={tab === 'settings'} aria-label="Настройки" onclick={() => navigateToTab('settings')}><span>◌</span>Моё</button>
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
