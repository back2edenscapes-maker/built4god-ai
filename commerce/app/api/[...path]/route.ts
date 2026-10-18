import { env } from 'cloudflare:workers';
import { route } from '../../../lib/commerce.mjs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => route(request, env);
export const POST = (request: Request) => route(request, env);
export const PUT = (request: Request) => route(request, env);
