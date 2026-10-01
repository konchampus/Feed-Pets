import { createClient } from 'npm:@supabase/supabase-js@2';
import { serveWithCors } from '../_shared/cors.ts';

serveWithCors(async (request) => {
	if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !supabaseUrl || !anonKey) return Response.json({ error: 'Authentication required' }, { status: 401 });
	const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
	const { data: { user }, error: userError } = await client.auth.getUser();
	if (userError || !user) return Response.json({ error: 'Authentication required' }, { status: 401 });
	const { name, pet } = await request.json();
	if (typeof name !== 'string' || !name.trim() || name.length > 80 || !pet || typeof pet.name !== 'string' || !pet.name.trim() || pet.name.length > 80) return Response.json({ error: 'Enter a family and dog name' }, { status: 400 });
	const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
	const { data: family, error: familyError } = await admin.from('families').insert({ name: name.trim(), created_by: user.id }).select('id').single();
	if (familyError || !family) return Response.json({ error: 'Could not create family' }, { status: 400 });
	const { error: memberError } = await admin.from('family_members').insert({ family_id: family.id, user_id: user.id, role: 'owner' });
	const { error: petError } = await admin.from('pets').insert({ family_id: family.id, name: pet.name.trim(), breed: typeof pet.breed === 'string' ? pet.breed.slice(0, 100) : '' });
	if (memberError || petError) {
		await admin.from('families').delete().eq('id', family.id);
		return Response.json({ error: 'Could not finish setting up family' }, { status: 400 });
	}
	return Response.json({ familyId: family.id }, { status: 201 });
});
