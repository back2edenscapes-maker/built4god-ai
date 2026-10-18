const encoder = new TextEncoder();
export const SKU = 'launchready-v1';
export const securityHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};
export function json(body, status = 200) {
  return Response.json(body, { status, headers: securityHeaders });
}
export async function digest(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function verifySignature(raw, header, secret, clock = Date.now()) {
  if (!secret || !header) return false;
  const fields = header.split(',').map(x=>x.trim().split('='));
  const ts = fields.find(([k])=>k === 't')?.[1];
  const signatures = fields.filter(([k])=>k === 'v1').map(([,v])=>v);
  if (!/^\d+$/.test(ts || '') || Math.abs(clock / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  for (const sig of signatures) {
    if (!/^[a-f0-9]{64}$/i.test(sig || '')) continue;
    const bytes = Uint8Array.from(sig.match(/../g), x=>parseInt(x,16));
    if (await crypto.subtle.verify('HMAC',key,bytes,encoder.encode(`${ts}.${raw}`))) return true;
  }
  return false;
}
export function config(env) {
  return { price: Number(env.PRICE_CENTS || 900), currency: 'usd', live: env.STRIPE_MODE === 'live' };
}
export async function readiness(env) {
  const issues=[];
  if (env.LIVE_SALES_ENABLED !== 'true') issues.push('sales_disabled');
  if (!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+$/.test(env.STRIPE_PAYMENT_LINK_URL || '')) issues.push('checkout_unconfigured');
  if (!/^plink_/.test(env.STRIPE_PAYMENT_LINK_ID || '')) issues.push('payment_link_unconfigured');
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) issues.push('webhook_unconfigured');
  if (!['live','test'].includes(env.STRIPE_MODE)) issues.push('mode_unconfigured');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SUPPORT_EMAIL || '')) issues.push('support_unconfigured');
  if (!env.DB) issues.push('database_unconfigured');
  else {try{await env.DB.prepare('SELECT session_hash FROM orders LIMIT 1').first();}catch{issues.push('database_not_ready');}}
  if (!/^[a-f0-9]{64}$/.test(env.PRODUCT_SHA256 || '')) issues.push('product_hash_unconfigured');
  let product;try{product=await env.BUCKET?.head(`${SKU}.zip`);}catch{}
  if (!product || product.customMetadata?.sha256!==env.PRODUCT_SHA256) issues.push('product_unavailable');
  const {price}=config(env);
  if (!Number.isSafeInteger(price) || price < 100 || price > 100000) issues.push('price_invalid');
  return {ready:issues.length===0,issues};
}
export async function applyEvent(db, event, env) {
  if (typeof event.id !== 'string' || !event.data?.object || event.livemode !== config(env).live) return {ignored:true};
  const object=event.data.object;
  const statements=[];
  if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
    if (object.payment_status !== 'paid' || object.mode !== 'payment' || object.payment_link !== env.STRIPE_PAYMENT_LINK_ID ||
        object.currency !== config(env).currency || object.amount_subtotal !== config(env).price ||
        !Number.isSafeInteger(object.amount_total) || object.amount_total < config(env).price ||
        object.metadata?.sku !== SKU || !/^cs_(test_|live_)/.test(object.id || '') || typeof object.payment_intent !== 'string') return {ignored:true};
    statements.push(db.prepare(`INSERT INTO orders(session_hash,payment_intent,amount_cents,currency,paid_at,livemode)
      VALUES(?,?,?,?,?,?) ON CONFLICT(session_hash) DO NOTHING`).bind(await digest(object.id),object.payment_intent,object.amount_subtotal,object.currency,event.created,Number(event.livemode)));
  } else if (event.type === 'charge.refunded') {
    if (typeof object.payment_intent !== 'string' || !Number.isSafeInteger(object.amount_refunded) || object.amount_refunded <= 0) return {ignored:true};
    statements.push(db.prepare(`INSERT INTO refunds(payment_intent,amount_cents) VALUES(?,?)
      ON CONFLICT(payment_intent) DO UPDATE SET amount_cents=MAX(refunds.amount_cents,excluded.amount_cents)`).bind(object.payment_intent,object.amount_refunded));
  } else return {ignored:true};
  statements.push(db.prepare('INSERT INTO receipts(event_id,event_type,received_at) VALUES(?,?,?) ON CONFLICT(event_id) DO NOTHING').bind(event.id,event.type,Math.floor(Date.now()/1000)));
  // D1 batch executes atomically. Order uniqueness and MAX refund make retries safe.
  await db.batch(statements);
  return {accepted:true};
}
export async function findOrder(db, session) {
  if (typeof session !== 'string' || !/^cs_(test_|live_)[A-Za-z0-9_]{12,240}$/.test(session)) return null;
  return db.prepare(`SELECT o.*,COALESCE(r.amount_cents,0) AS refunded FROM orders o
    LEFT JOIN refunds r ON r.payment_intent=o.payment_intent WHERE session_hash=?`).bind(await digest(session)).first();
}
async function admin(request,env) {
  const received=request.headers.get('authorization');
  const token=new URL(request.url).pathname==='/api/admin/revenue' ? env.REPORT_TOKEN : env.ADMIN_TOKEN;
  if (!token || !received) return false;
  return (await digest(received)) === (await digest(`Bearer ${token}`));
}
async function limitedBody(request,limit) {
  if(Number(request.headers.get('content-length') || 0)>limit)throw new Error('Too large');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new Error('Too large');}chunks.push(value);}
  const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
export async function route(request, env) {
  const url=new URL(request.url);
  if (url.pathname === '/api/health' && request.method === 'GET') {
    const state=await readiness(env);
    return json({service:'BUILT 4 GOD AI',checkout_ready:state.ready,mode:env.STRIPE_MODE || 'unconfigured'});
  }
  if (url.pathname === '/api/checkout' && request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin) return json({error:'Origin not allowed'},403);
    const state=await readiness(env);
    if (!state.ready) return json({error:'Checkout is not open yet. You have not been charged.'},503);
    return new Response(null,{status:303,headers:{...securityHeaders,Location:env.STRIPE_PAYMENT_LINK_URL}});
  }
  if (url.pathname === '/api/stripe/webhook' && request.method === 'POST') {
    if (!env.DB || !env.STRIPE_WEBHOOK_SECRET) return json({error:'Webhook not configured'},503);
    if (Number(request.headers.get('content-length') || 0) > 1000000) return json({error:'Too large'},413);
    let raw;try{raw=new TextDecoder().decode(await limitedBody(request,1000000));}catch{return json({error:'Too large'},413);}
    if (!await verifySignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET)) return json({error:'Invalid signature'},400);
    let event;try {event=JSON.parse(raw);} catch {return json({error:'Invalid payload'},400);}
    try {return json(await applyEvent(env.DB,event,env));} catch {return json({error:'Temporary processing failure; retry required'},500);}
  }
  if (['/api/order','/api/download'].includes(url.pathname) && request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin) return json({error:'Origin not allowed'},403);
    if (!env.DB) return json({error:'Delivery is not configured'},503);
    let input;try {input=JSON.parse(new TextDecoder().decode(await limitedBody(request,2048)));} catch {return json({error:'Invalid request'},400);}
    const order=await findOrder(env.DB,input.session_id);
    if (!order) return json({status:'pending',message:'Payment confirmation has not arrived yet. Retry after a few seconds.'},202);
    if (order.refunded > 0) return json({status:'revoked',message:'This order was refunded. Contact support for help.'},403);
    if (order.livemode !== Number(config(env).live)) return json({status:'unavailable'},403);
    if (url.pathname === '/api/order') return json({status:'paid',product:SKU});
    const file=await env.BUCKET?.get(`${SKU}.zip`);
    if (!file || file.customMetadata?.sha256!==env.PRODUCT_SHA256) return json({error:'File temporarily unavailable. Contact support.'},503);
    return new Response(file.body,{headers:{...securityHeaders,'Content-Type':'application/zip','Content-Disposition':'attachment; filename="BUILT4GOD_LaunchReady_Product_v1.zip"'}});
  }
  if (url.pathname.startsWith('/api/admin/')) {
    if (!await admin(request,env)) return json({error:'Unauthorized'},401);
    if (url.pathname === '/api/admin/status' && request.method === 'GET') return json(await readiness(env));
    if (url.pathname === '/api/admin/product' && request.method === 'PUT') {
      if (!env.BUCKET || !env.PRODUCT_SHA256) return json({error:'Storage or product hash not configured'},503);
      if (Number(request.headers.get('content-length') || 0)>10000000) return json({error:'Too large'},413);
      let buffer;try{buffer=await limitedBody(request,10000000);}catch{return json({error:'Too large'},413);}
      if (buffer.byteLength>10000000 || buffer.byteLength<22) return json({error:'Invalid size'},400);
      if (await digest(buffer) !== env.PRODUCT_SHA256) return json({error:'Product checksum mismatch'},400);
      await env.BUCKET.put(`${SKU}.zip`,buffer,{httpMetadata:{contentType:'application/zip'},customMetadata:{sha256:env.PRODUCT_SHA256}});
      return json({uploaded:true,bytes:buffer.byteLength});
    }
    if (url.pathname === '/api/admin/revenue' && request.method === 'GET') {
      if (!env.DB) return json({error:'Database not configured'},503);
      const rows=await env.DB.prepare(`SELECT currency,COUNT(*) AS paid_orders,SUM(o.amount_cents) AS gross_cents,
        SUM(MIN(o.amount_cents,COALESCE(r.amount_cents,0))) AS refunded_cents,
        SUM(o.amount_cents-MIN(o.amount_cents,COALESCE(r.amount_cents,0))) AS net_before_fees_cents
        FROM orders o LEFT JOIN refunds r ON r.payment_intent=o.payment_intent WHERE o.livemode=1 GROUP BY currency`).all();
      return json({generated_at:new Date().toISOString(),source:'verified_stripe_webhooks',collection_status:env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PAYMENT_LINK_ID ? 'configured' : 'not_configured',totals:rows.results,fees_included:false});
    }
  }
  return json({error:'Not found'},404);
}
