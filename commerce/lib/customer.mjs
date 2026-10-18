// Transactional fulfillment only. Never use this queue for marketing.
import {digest} from './commerce.mjs';
const enc=new TextEncoder(),dec=new TextDecoder();
const emailPattern=/^[^\s@<>\r\n]{1,128}@[^\s@<>\r\n]{1,125}\.[^\s@<>\r\n]{1,63}$/;
export const validEmail=value=>typeof value==='string' && value.length<=254 && emailPattern.test(value);
export function emailReady(env){return env.EMAIL_ENABLED==='true' && env.SUPPORT_MODE!=='pending' && validEmail(env.SUPPORT_EMAIL) && /^re_/.test(env.RESEND_API_KEY||'') && /^[a-f0-9]{64}$/.test(env.CUSTOMER_DATA_KEY||'') && validEmail(env.EMAIL_FROM) && env.SITE_ORIGIN==='https://built4god-launchready.wearebuilt4god.chatgpt.site';}
async function key(env){return crypto.subtle.importKey('raw',Uint8Array.from(env.CUSTOMER_DATA_KEY.match(/../g),x=>parseInt(x,16)),'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(value,env){const iv=crypto.getRandomValues(new Uint8Array(12));const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),enc.encode(JSON.stringify(value))));return btoa(String.fromCharCode(...iv,...data));}
export async function open(value,env){const data=Uint8Array.from(atob(value),x=>x.charCodeAt(0));return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},await key(env),data.slice(12))));}
const token=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function emailHash(email,env){return digest(`${env.CUSTOMER_DATA_KEY}:email:${email.trim().toLowerCase()}`);}
export async function queueEmail(db,env,orderHash,email,id,now=Math.floor(Date.now()/1000)){
  if(!emailReady(env)||!validEmail(email))return false;
  if(await db.prepare('SELECT id FROM email_outbox WHERE id=?').bind(id).first())return true;
  const order=await db.prepare(`SELECT o.session_hash,COALESCE(r.amount_cents,0) refunded FROM orders o LEFT JOIN refunds r ON r.payment_intent=o.payment_intent WHERE o.session_hash=? AND o.livemode=?`).bind(orderHash,Number(env.STRIPE_MODE==='live')).first();
  if(!order||order.refunded>0)return false;
  const access=token(),expires=now+86400;
  const payload=await seal({from:env.EMAIL_FROM,to:[email.trim().toLowerCase()],reply_to:env.SUPPORT_EMAIL,subject:'Your LaunchReady download access',text:`Your LaunchReady purchase is confirmed.\n\nOpen your private access page within 24 hours:\n${env.SITE_ORIGIN}/delivery#access=${access}\n\nThis link grants access to your purchase. Keep it private. The app verifies payment again before every download. Refunded purchases cannot download.\n\nOn a phone, save the ZIP in Files or Downloads, then extract it. Open WORKBOOK.html in a browser and the CSV files in a spreadsheet app.\n\nLost or expired link? Request a new one at ${env.SITE_ORIGIN}/recover using your checkout email.\nSupport and refund requests: ${env.SUPPORT_EMAIL}\nPolicies: ${env.SITE_ORIGIN}/policies\n\nBUILT 4 GOD AI — Built With Purpose. Powered by Intelligence. Guided by Faith.`},env);
  await db.batch([
    db.prepare('INSERT INTO customer_contacts(order_hash,email_hash,email_cipher) VALUES(?,?,?) ON CONFLICT(order_hash) DO NOTHING').bind(orderHash,await emailHash(email,env),await seal(email.trim().toLowerCase(),env)),
    db.prepare('INSERT INTO access_tokens(token_hash,order_hash,expires_at) VALUES(?,?,?)').bind(await digest(access),orderHash,expires),
    db.prepare('INSERT INTO email_outbox(id,order_hash,payload,created_at,next_attempt,lease_until,attempts,status) VALUES(?,?,?,?,?,0,0,?) ON CONFLICT(id) DO NOTHING').bind(id,orderHash,payload,now,now,'queued')
  ]);
  return true;
}
export async function flushEmails(db,env,send=fetch,now=Math.floor(Date.now()/1000)){
  if(!emailReady(env))return {status:'not_configured',sent:0};
  const rows=await db.prepare("SELECT id FROM email_outbox WHERE status='queued' AND next_attempt<=? AND lease_until<? ORDER BY created_at LIMIT 5").bind(now,now).all();let sent=0;
  for(const {id} of rows.results){
    const item=await db.prepare("UPDATE email_outbox SET lease_until=?,attempts=attempts+1 WHERE id=? AND status='queued' AND lease_until<? RETURNING *").bind(now+90,id,now).first();if(!item)continue;
    const order=await db.prepare('SELECT COALESCE(r.amount_cents,0) refunded FROM orders o LEFT JOIN refunds r ON r.payment_intent=o.payment_intent WHERE o.session_hash=?').bind(item.order_hash).first();
    // Never retry beyond provider's 24-hour idempotency retention window.
    if(!order||order.refunded>0||now-item.created_at>=23*3600){await db.batch([db.prepare("UPDATE email_outbox SET status=?,payload='' WHERE id=?").bind(order?.refunded>0?'revoked':'needs_support',id)]);continue;}
    const day=Math.floor(now/86400),month=new Date(now*1000).toISOString().slice(0,7);
    if(!await limit(db,`send-day:${day}`,90,(day+1)*86400)||!await limit(db,`send-month:${month}`,2800,now+32*86400)){
      await db.batch([db.prepare('UPDATE email_outbox SET next_attempt=?,lease_until=0 WHERE id=?').bind(now+3600,id)]);continue;
    }
    try{
      const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`launchready/${id}`},body:JSON.stringify(await open(item.payload,env)),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Email provider rejected request');
      const result=await response.json();if(typeof result.id!=='string')throw new Error('Missing email acknowledgement');
      await db.batch([db.prepare("UPDATE email_outbox SET status='sent',sent_at=?,payload='',lease_until=0 WHERE id=?").bind(now,id)]);sent++;
    }catch{await db.batch([db.prepare('UPDATE email_outbox SET next_attempt=?,lease_until=0 WHERE id=?').bind(now+Math.min(3600,60*2**Math.min(item.attempts,6)),id)]);}
  }
  // Retain operational counters, erase expired credentials and abuse counters.
  await db.batch([db.prepare('DELETE FROM access_tokens WHERE expires_at<?').bind(now),db.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(now)]);
  return {status:'configured',sent};
}
export async function accessOrder(db,access,now=Math.floor(Date.now()/1000)){
  if(!/^[a-f0-9]{64}$/.test(access||''))return null;
  return db.prepare(`SELECT o.*,COALESCE(r.amount_cents,0) refunded FROM access_tokens t JOIN orders o ON o.session_hash=t.order_hash LEFT JOIN refunds r ON r.payment_intent=o.payment_intent WHERE t.token_hash=? AND t.expires_at>?`).bind(await digest(access),now).first();
}
export async function recoveryOrder(db,code){
  if(!/^b4g_[a-f0-9]{64}$/.test(code||''))return null;
  return db.prepare(`SELECT o.*,COALESCE(r.amount_cents,0) refunded FROM recovery_codes c JOIN orders o ON o.session_hash=c.order_hash LEFT JOIN refunds r ON r.payment_intent=o.payment_intent WHERE c.code_hash=?`).bind(await digest(code)).first();
}
export async function createRecoveryCode(db,orderHash){
  const code=`b4g_${token()}`;
  const row=await db.prepare('INSERT INTO recovery_codes(code_hash,order_hash,created_at) VALUES(?,?,?) ON CONFLICT(order_hash) DO NOTHING RETURNING code_hash').bind(await digest(code),orderHash,Math.floor(Date.now()/1000)).first();
  return row?code:null;
}
async function limit(db,id,maximum,expires){const row=await db.prepare('INSERT INTO request_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(id,expires).first();return row.count<=maximum;}
export async function recover(db,env,email,ip,now=Math.floor(Date.now()/1000)){
  if(!emailReady(env))return {status:'not_configured'};
  const normalized=validEmail(email)?email.trim().toLowerCase():'';
  const hour=Math.floor(now/3600),day=Math.floor(now/86400),hash=await emailHash(normalized,env);
  const allowed=await limit(db,await digest(`${env.CUSTOMER_DATA_KEY}:ip:${ip}:${hour}`),5,(hour+1)*3600) && await limit(db,`recipient:${hash}:${hour}`,3,(hour+1)*3600) && await limit(db,`global:${day}`,50,(day+1)*86400);
  if(allowed&&normalized){const rows=await db.prepare(`SELECT c.order_hash,c.email_cipher FROM customer_contacts c JOIN orders o ON o.session_hash=c.order_hash LEFT JOIN refunds r ON r.payment_intent=o.payment_intent WHERE c.email_hash=? AND o.livemode=? AND COALESCE(r.amount_cents,0)=0 LIMIT 1`).bind(hash,Number(env.STRIPE_MODE==='live')).all();for(const row of rows.results)await queueEmail(db,env,row.order_hash,await open(row.email_cipher,env),`recovery-${row.order_hash}-${hour}`,now);}
  return {status:'accepted',message:'If an eligible purchase matches that email, a private access link will arrive shortly. Check spam too. If it does not arrive, contact support.'};
}
