const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Expose-Headers': 'Retry-After',
	'Access-Control-Max-Age': '86400'
};

export function serveWithCors(handler: (request: Request) => Promise<Response> | Response) {
	return Deno.serve(async (request) => {
		const response = request.method === 'OPTIONS'
			? new Response('ok', { status: 200 })
			: await handler(request);
	for (const [name, value] of Object.entries(corsHeaders)) response.headers.set(name, value);
	return response;
	});
}
