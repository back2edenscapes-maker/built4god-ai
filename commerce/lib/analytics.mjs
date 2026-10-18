export const SOURCES=['direct','search','reddit','indiehackers','youtube','pinterest','linkedin','referral','other','owned_social','owned_article'];
export async function track(db,event,source,now=new Date()){
  if(!['visit','preview','checkout'].includes(event)||!SOURCES.includes(source))return false;
  await db.batch([db.prepare('INSERT INTO traffic_daily(day,event,source,count) VALUES(?,?,?,1) ON CONFLICT(day,event,source) DO UPDATE SET count=count+1').bind(now.toISOString().slice(0,10),event,source)]);return true;
}
export async function growth(db,env){
  const rows=await db.prepare('SELECT day,event,source,count FROM traffic_daily ORDER BY day DESC,source,event LIMIT 2000').all();
  const totals=await db.prepare(`SELECT COUNT(*) paid_orders,COALESCE(SUM(o.amount_cents),0) gross_cents,COALESCE(SUM(MIN(o.amount_cents,COALESCE(r.amount_cents,0))),0) refunded_cents FROM orders o LEFT JOIN refunds r ON r.payment_intent=o.payment_intent WHERE o.livemode=1`).first();
  const counts=await db.prepare('SELECT event,SUM(count) count FROM traffic_daily GROUP BY event').all();const c=Object.fromEntries(counts.results.map(x=>[x.event,x.count]));
  const mail=await db.prepare('SELECT status,COUNT(*) count FROM email_outbox GROUP BY status').all();
  const state=env.ANALYTICS_STARTED_AT;
  const since=state?Math.floor(new Date(state).getTime()/1000):null;
  const windowOrders=since===null?null:await db.prepare('SELECT COUNT(*) count FROM orders WHERE livemode=1 AND paid_at>=?').bind(since).first();
  const sources=await db.prepare("SELECT COALESCE(s.source,'unknown') source,COUNT(*) paid_orders FROM orders o LEFT JOIN order_sources s ON s.order_hash=o.session_hash WHERE o.livemode=1 GROUP BY COALESCE(s.source,'unknown')").all();
  return {generated_at:new Date().toISOString(),analytics_status:state?'collecting':'not_initialized',analytics_started_at:state||null,traffic:rows.results,counts:{visit:c.visit||0,preview:c.preview||0,checkout:c.checkout||0},sales:{...totals,net_before_fees_cents:totals.gross_cents-totals.refunded_cents,processor_fees_cents:null,net_after_known_fees_cents:null,currency:'usd'},orders_since_analytics_started:windowOrders?.count??null,orders_by_source:sources.results,order_per_pageview_rate:c.visit&&windowOrders?windowOrders.count/c.visit:null,rate_limitations:'Pageview events, not unique people. Bots/reloads and blocked scripts affect counts. Revenue totals are lifetime. The order/pageview rate uses orders since analytics activation. Source attribution is a client-supplied category and is not independently verified; direct checkout-link orders are unknown.',email_status:env.EMAIL_ENABLED==='true'?'enabled_check_provider_delivery':'disabled',email_queue:mail.results};
}
