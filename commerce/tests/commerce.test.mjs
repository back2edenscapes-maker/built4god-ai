import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {route,applyEvent,findOrder,verifySignature,digest,readiness} from '../lib/commerce.mjs';
import {emailReady,queueEmail,flushEmails,open,accessOrder,recover} from '../lib/customer.mjs';
import {track,growth} from '../lib/analytics.mjs';

function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url))).entries){sqlite.exec(readFileSync(new URL(`../drizzle/${file.tag}.sql`,import.meta.url),'utf8'));}
 const wrapper={prepare(sql){let params=[];return {bind(...p){params=p;return this;},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};},run(){return sqlite.prepare(sql).run(...params);}};},async batch(items){sqlite.exec('BEGIN');try{const results=items.map(x=>x.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return wrapper;
}
const session='cs_test_fixture_reference_123456789';
const envBase={STRIPE_MODE:'test',STRIPE_PAYMENT_LINK_ID:'plink_fixture',PRICE_CENTS:'900'};
function event(overrides={}){return {id:'evt_fixture',created:1000000,livemode:false,type:'checkout.session.completed',data:{object:{id:session,payment_status:'paid',mode:'payment',payment_link:'plink_fixture',currency:'usd',amount_subtotal:900,amount_total:900,payment_intent:'pi_fixture',metadata:{sku:'launchready-v1'}}},...overrides};}
async function sign(raw,secret,t=Math.floor(Date.now()/1000)){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${t}.${raw}`)))].map(x=>x.toString(16).padStart(2,'0')).join('');return `t=${t},v1=${sig}`;}
function req(path,body,headers={}){return new Request(`https://shop.example${path}`,{method:'POST',headers:{origin:'https://shop.example','content-type':'application/json',...headers},body:JSON.stringify(body)});}

test('signature rejects altered payloads, stale timestamps and absent secrets',async()=>{const raw=JSON.stringify(event());const header=await sign(raw,'fixture-secret');assert.equal(await verifySignature(raw,header,'fixture-secret'),true);assert.equal(await verifySignature(raw+' ',header,'fixture-secret'),false);assert.equal(await verifySignature(raw,await sign(raw,'fixture-secret',1),'fixture-secret'),false);assert.equal(await verifySignature(raw,header,''),false);});
test('only paid matching mode, amount, product and payment link grant access',async()=>{for(const field of [{payment_status:'unpaid'},{payment_link:'plink_wrong'},{currency:'eur'},{amount_subtotal:1},{metadata:{sku:'other'}},{mode:'subscription'}]){const db=database();const e=event();Object.assign(e.data.object,field);assert.deepEqual(await applyEvent(db,e,envBase),{ignored:true});assert.equal(await findOrder(db,session),null);}const db=database();await applyEvent(db,event({livemode:true}),envBase);assert.equal(await findOrder(db,session),null);});
test('duplicate events and asynchronous success fulfill once',async()=>{const db=database();await applyEvent(db,event(),envBase);await applyEvent(db,event(),envBase);await applyEvent(db,event({id:'evt_async',type:'checkout.session.async_payment_succeeded'}),envBase);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM orders').first()).n,1);assert.equal((await findOrder(db,session)).amount_cents,900);assert.notEqual((await findOrder(db,session)).session_hash,session);});
test('refund arriving before payment prevents downloads even after replay',async()=>{const db=database();const refund=event({id:'evt_refund',type:'charge.refunded',data:{object:{payment_intent:'pi_fixture',amount_refunded:900}}});await applyEvent(db,refund,envBase);await applyEvent(db,event(),envBase);await applyEvent(db,event(),envBase);const result=await route(req('/api/download',{session_id:session}),{...envBase,DB:db});assert.equal(result.status,403);});
test('pending, foreign-origin and unauthenticated admin requests cannot download',async()=>{const db=database();assert.equal((await route(req('/api/download',{session_id:session}),{...envBase,DB:db})).status,202);assert.equal((await route(req('/api/download',{session_id:session},{origin:'https://evil.example'}),{...envBase,DB:db})).status,403);assert.equal((await route(new Request('https://shop.example/api/admin/revenue'),{DB:db})).status,401);});
test('valid signed webhook enables paid delivery; missing signature fails closed',async()=>{const db=database();const e=event(),raw=JSON.stringify(e),secret='whsec_fixture';const env={...envBase,DB:db,STRIPE_WEBHOOK_SECRET:secret,PRODUCT_SHA256:'fixture-hash',BUCKET:{async get(){return {body:new Uint8Array([80,75,3,4]),customMetadata:{sha256:'fixture-hash'}}}}};assert.equal((await route(req('/api/stripe/webhook',e),env)).status,400);assert.equal((await route(req('/api/stripe/webhook',e,{'stripe-signature':await sign(raw,secret)}),env)).status,200);const response=await route(req('/api/download',{session_id:session}),env);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/zip');assert.equal(response.headers.get('referrer-policy'),'no-referrer');});
test('checkout stays closed without full configuration and product',async()=>{const state=await readiness({});assert.equal(state.ready,false);assert.equal((await route(req('/api/checkout',{}),{})).status,503);});
test('admin product upload checks checksum and cannot be called anonymously',async()=>{const payload=new Uint8Array(30);const env={ADMIN_TOKEN:'fixture-admin',PRODUCT_SHA256:await digest(payload),BUCKET:{async put(key,bytes){assert.equal(bytes.byteLength,30);}}};const request=()=>new Request('https://shop.example/api/admin/product',{method:'PUT',headers:{authorization:'Bearer fixture-admin'},body:payload});assert.equal((await route(request(),env)).status,200);assert.equal((await route(request(),{...env,PRODUCT_SHA256:'wrong'})).status,400);});
test('configured checkout redirects only to hosted Stripe payment link',async()=>{const hash='a'.repeat(64);const env={...envBase,DB:database(),LIVE_SALES_ENABLED:'true',STRIPE_PAYMENT_LINK_URL:'https://buy.stripe.com/test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',SUPPORT_EMAIL:'support@example.test',PRODUCT_SHA256:hash,BUCKET:{async head(){return {customMetadata:{sha256:hash}}}}};assert.equal((await readiness(env)).ready,true);const response=await route(req('/api/checkout',{}),env);assert.equal(response.status,303);assert.equal(response.headers.get('location'),env.STRIPE_PAYMENT_LINK_URL);assert.equal((await readiness({...env,STRIPE_PAYMENT_LINK_URL:'https://evil.example/pay'})).ready,false);});
test('verified live revenue is net of refunds and contains no order references',async()=>{const db=database();const liveEnv={...envBase,STRIPE_MODE:'live',DB:db,REPORT_TOKEN:'fixture-report'};await applyEvent(db,event({livemode:true}),liveEnv);await applyEvent(db,event({livemode:true,id:'evt_ref',type:'charge.refunded',data:{object:{payment_intent:'pi_fixture',amount_refunded:300}}}),liveEnv);const r=await route(new Request('https://shop.example/api/admin/revenue',{headers:{authorization:'Bearer fixture-report'}}),liveEnv);const p=await r.json();assert.equal(p.totals[0].net_before_fees_cents,600);assert.equal(JSON.stringify(p).includes('pi_fixture'),false);});

const mailEnv={...envBase,EMAIL_ENABLED:'true',RESEND_API_KEY:'re_fixture',CUSTOMER_DATA_KEY:'ab'.repeat(32),EMAIL_FROM:'orders@example.test',SUPPORT_EMAIL:'support@example.test',SITE_ORIGIN:'https://built4god-launchready.wearebuilt4god.chatgpt.site'};
test('purchase retries create one encrypted email, one provider send and hashed expiring access',async()=>{
 const db=database(),env={...mailEnv,DB:db},e=event();e.data.object.customer_details={email:'buyer@example.test'};
 await applyEvent(db,e,env);await applyEvent(db,e,env);await applyEvent(db,{...e,id:'evt_async',type:'checkout.session.async_payment_succeeded'},env);
 const rows=await db.prepare('SELECT * FROM email_outbox').all();assert.equal(rows.results.length,1);const item=rows.results[0];assert.ok(!item.payload.includes('buyer@'));const payload=await open(item.payload,env);const access=payload.text.match(/#access=([a-f0-9]{64})/)[1];assert.equal((await accessOrder(db,access)).amount_cents,900);assert.equal(await accessOrder(db,access,item.created_at+86401),null);
 let calls=0;const send=async(url,opts)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.ok(opts.headers['Idempotency-Key']);return Response.json({id:'email_fixture'});};
 await Promise.all([flushEmails(db,env,send),flushEmails(db,env,send)]);assert.equal(calls,1);assert.equal((await db.prepare('SELECT payload FROM email_outbox').first()).payload,'');
 await applyEvent(db,event({id:'evt_refund',type:'charge.refunded',data:{object:{payment_intent:'pi_fixture',amount_refunded:1}}}),env);
 const response=await route(req('/api/download',{access_token:access}),env);assert.equal(response.status,403);
});
test('email failure keeps the order usable and retries an identical provider payload',async()=>{
 const db=database();await applyEvent(db,event(),envBase);await queueEmail(db,mailEnv,await digest(session),'buyer@example.test','fixture-job',1000);
 const bodies=[];await flushEmails(db,mailEnv,async(_,o)=>{bodies.push(o.body);throw Error('timeout');},1001);assert.equal((await findOrder(db,session)).amount_cents,900);
 await flushEmails(db,mailEnv,async(_,o)=>{bodies.push(o.body);return Response.json({id:'email_fixture'});},1300);assert.equal(bodies[0],bodies[1]);assert.equal((await db.prepare('SELECT status FROM email_outbox').first()).status,'sent');
});
test('recovery hides existence, is throttled, and never restores refunded access',async()=>{
 const db=database();await applyEvent(db,event(),envBase);await queueEmail(db,mailEnv,await digest(session),'buyer@example.test','purchase',1000);
 const known=await recover(db,mailEnv,'buyer@example.test','fixture-ip',1100),unknown=await recover(db,mailEnv,'unknown@example.test','other-ip',1100);assert.deepEqual(known,unknown);
 for(let i=0;i<8;i++)await recover(db,mailEnv,'buyer@example.test','fixture-ip',1100+i);assert.equal((await db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE id LIKE 'recovery-%'").first()).n,1);
 await applyEvent(db,event({id:'evt_refund',type:'charge.refunded',data:{object:{payment_intent:'pi_fixture',amount_refunded:900}}}),mailEnv);let calls=0;await flushEmails(db,mailEnv,async()=>{calls++;return Response.json({id:'unused'});},1200);assert.equal(calls,0);
});
test('unset email leaves original fulfillment intact and recovery gives honest fallback',async()=>{assert.equal(emailReady({}),false);const db=database();await applyEvent(db,event(),envBase);assert.equal((await findOrder(db,session)).amount_cents,900);assert.equal((await route(req('/api/recover',{email:'buyer@example.test'}),{DB:db})).status,503);});
test('traffic stores bounded categories only, respects opt-out and report access remains private',async()=>{
 const db=database();assert.equal(await track(db,'visit','reddit'),true);assert.equal(await track(db,'visit','cs_test_sensitive'),false);
 const env={DB:db,REPORT_TOKEN:'fixture',ANALYTICS_STARTED_AT:'2026-10-18T00:00:00Z'};
 const ignored=await route(req('/api/analytics',{event:'visit',source:'direct'},{dnt:'1'}),env);assert.equal((await ignored.json()).status,'skipped');
 assert.equal((await route(new Request('https://shop.example/api/admin/growth'),env)).status,401);
 const response=await route(new Request('https://shop.example/api/admin/growth',{headers:{authorization:'Bearer fixture'}}),env);assert.equal(response.status,200);const data=await response.json();assert.equal(data.counts.visit,1);assert.equal(data.sales.processor_fees_cents,null);assert.equal(data.sales.net_after_known_fees_cents,null);assert.equal(data.order_per_pageview_rate,0);
});
test('account-free recovery requires a paid credential, stores only a hash, and revokes on refund',async()=>{
 const db=database(),env={...envBase,DB:db};
 assert.equal((await route(req('/api/recovery-code',{session_id:session}),env)).status,202);
 await applyEvent(db,event(),envBase);
 const issued=await route(req('/api/recovery-code',{session_id:session}),env);const {code}=await issued.json();assert.match(code,/^b4g_[a-f0-9]{64}$/);
 const stored=await db.prepare('SELECT * FROM recovery_codes').first();assert.notEqual(stored.code_hash,code);assert.equal((await route(req('/api/recovery-code',{session_id:session}),env)).status,409);
 assert.equal((await route(req('/api/order',{recovery_code:code}),env)).status,200);
 assert.equal((await route(req('/api/order',{recovery_code:'b4g_'+'0'.repeat(64)}),env)).status,403);
 await applyEvent(db,event({id:'evt_refund',type:'charge.refunded',data:{object:{payment_intent:'pi_fixture',amount_refunded:900}}}),env);
 assert.equal((await route(req('/api/order',{recovery_code:code}),env)).status,403);
});
