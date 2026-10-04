import { createClient } from 'npm:@supabase/supabase-js@2';
import { createApiKeyFetch, getSecretKey } from '../_shared/api-keys.ts';
import { fetchAllPages } from '../_shared/paginated-query.ts';
import { makePushClient, sendFamilyPush } from '../_shared/push.ts';

type ReminderSchedule = {
	id: string;
	family_id: string;
	pet_id: string;
	kind: string;
	title: string;
	local_time: string;
	timezone: string;
	weekdays: number[];
	last_notified_for: string | null;
	pets: { name?: string } | null;
	created_by: string;
};

function getLocalTime(timezone: string) {
	const now = new Date();
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
	const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
	return { date: `${value('year')}-${value('month')}-${value('day')}`, minute: `${value('hour')}:${value('minute')}`, weekday };
}

Deno.serve(async (request) => {
	if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
	const cronSecret = Deno.env.get('CRON_SECRET');
	if (!cronSecret || request.headers.get('Authorization') !== `Bearer ${cronSecret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
	const secretKey = getSecretKey();
	const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { global: { fetch: createApiKeyFetch(secretKey) }, auth: { persistSession: false } });
	let schedules: ReminderSchedule[];
	try {
		schedules = await fetchAllPages<ReminderSchedule>(async (afterId, pageSize) => {
			let query = admin.from('care_schedules').select('id,family_id,pet_id,kind,title,local_time,timezone,weekdays,last_notified_for,pets(name),created_by')
				.eq('is_active', true).order('id', { ascending: true });
			if (afterId) query = query.gt('id', afterId);
			const { data, error } = await query.limit(pageSize);
			return { data: data as ReminderSchedule[] | null, error };
		});
	} catch {
		return Response.json({ error: 'Could not load schedules' }, { status: 500 });
	}
	const due: typeof schedules = [];
	for (const schedule of schedules ?? []) {
		let local;
		try { local = getLocalTime(schedule.timezone); } catch { continue; }
		const scheduledTime = String(schedule.local_time).slice(0, 5);
		if (schedule.weekdays.includes(local.weekday) && scheduledTime <= local.minute && schedule.last_notified_for !== local.date) due.push(schedule);
	}
	if (!due.length) return Response.json({ sent: 0 });
	try {
		const push = makePushClient();
		let sent = 0;
		for (const schedule of due) {
			const localDate = getLocalTime(schedule.timezone).date;
			const { data: claimed, error: claimError } = await admin.rpc('claim_care_schedule', { schedule_id: schedule.id, local_date: localDate });
			if (claimError || typeof claimed !== 'string') continue;
			const dogName = (schedule.pets as { name?: string } | null)?.name ?? 'собака';
			try {
				const { data: receipts, error: deliveryError } = await admin.from('push_delivery_receipts').select('subscription_id').eq('schedule_id', schedule.id).eq('local_date', localDate);
				if (deliveryError) throw deliveryError;
				await sendFamilyPush(admin, push, schedule.family_id, null, { title: 'Напоминание от Лапок', body: `${dogName}: ${schedule.title}`, url: './', tag: `schedule-${schedule.id}` }, {
					deliveredSubscriptionIds: (receipts ?? []).map((receipt) => receipt.subscription_id),
					markDelivered: async (subscriptionId) => {
						const { data: recorded, error } = await admin.rpc('record_care_schedule_push_delivery', {
							target_schedule: schedule.id,
							local_date: localDate,
							claim_token: claimed,
							target_subscription: subscriptionId
						});
						if (error || !recorded) throw error ?? new Error('Schedule claim is no longer active');
					}
				});
				const { data: completed, error: completeError } = await admin.rpc('complete_care_schedule', { schedule_id: schedule.id, local_date: localDate, claim_token: claimed });
				if (completeError || !completed) throw completeError ?? new Error('Schedule claim is no longer active');
				sent++;
			} catch { await admin.rpc('release_care_schedule', { schedule_id: schedule.id, claim_token: claimed }); }
		}
		return Response.json({ sent });
	} catch { return Response.json({ error: 'Push is not configured' }, { status: 503 }); }
});
