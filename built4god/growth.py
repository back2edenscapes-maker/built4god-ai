"""Private aggregate performance review and non-transactional checkout monitor."""
import math
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def request(path,method='GET',token=None):
    origin=os.environ['COMMERCE_SITE_URL'].rstrip('/');p=urlsplit(origin)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.query or p.fragment or p.path:raise ValueError('Plain HTTPS origin required')
    headers={'DNT':'1','Origin':origin,'User-Agent':'BUILT4GOD-health-monitor/1.0'}
    if token:headers['Authorization']='Bearer '+token
    if os.environ.get('COMMERCE_SITE_SERVICE_TOKEN'):headers['OAI-Sites-Authorization']='Bearer '+os.environ['COMMERCE_SITE_SERVICE_TOKEN']
    req=urllib.request.Request(origin+path,headers=headers,data=b'' if method=='POST' else None,method=method)
    try:response=urllib.request.build_opener(NoRedirect).open(req,timeout=25)
    except urllib.error.HTTPError as exc:response=exc
    with response:
        body=response.read(1_000_001)
        if len(body)>1_000_000:raise ValueError('Oversized response')
        return response.status,dict(response.headers),body

def sanitize(data):
    if data.get('analytics_status') not in ('collecting','not_initialized'):raise ValueError('Invalid collection status')
    rate=data.get('order_per_pageview_rate')
    if rate is not None and (type(rate) not in (int,float) or not math.isfinite(rate) or rate<0):raise ValueError('Invalid rate')
    datetime.fromisoformat(data['generated_at'].replace('Z','+00:00'))
    if data.get('analytics_started_at') is not None:datetime.fromisoformat(data['analytics_started_at'].replace('Z','+00:00'))
    if data.get('email_status') not in ('disabled','enabled_check_provider_delivery'):raise ValueError('Invalid email state')
    sales=data['sales'];fields=('paid_orders','gross_cents','refunded_cents','net_before_fees_cents')
    if any(type(sales.get(k)) is not int or sales[k]<0 for k in fields):raise ValueError('Invalid verified totals')
    if sales['gross_cents']-sales['refunded_cents']!=sales['net_before_fees_cents']:raise ValueError('Totals do not reconcile')
    if sales.get('currency')!='usd':raise ValueError('Unexpected currency')
    counts={k:data['counts'][k] for k in ('visit','preview','checkout')}
    if any(type(v) is not int or v<0 for v in counts.values()):raise ValueError('Invalid event counts')
    sources={'direct','search','reddit','indiehackers','youtube','pinterest','linkedin','referral','other','owned_social','owned_article'}
    traffic=[]
    for row in data['traffic']:
        if row['event'] not in counts or row['source'] not in sources or type(row['count']) is not int or row['count']<0:raise ValueError('Invalid aggregate')
        datetime.strptime(row['day'],'%Y-%m-%d');traffic.append({k:row[k] for k in ('day','event','source','count')})
    # Never echo unknown fields from the service, even if it changes in the future.
    return {'generated_at':data['generated_at'],'analytics_status':data['analytics_status'],'analytics_started_at':data.get('analytics_started_at'),'counts':counts,'traffic':traffic,'sales':{**{k:sales[k] for k in fields},'currency':'usd','processor_fees_cents':None,'net_after_known_fees_cents':None},'order_per_pageview_rate':data.get('order_per_pageview_rate'),'rate_limitations':'Events, not unique people. Bots and reloads affect counts; privacy opt-outs are not measured. Source tags are client supplied. Fees and net after fees are unavailable.','email_status':data.get('email_status','unknown')}

def main():
    if not os.environ.get('COMMERCE_REPORT_TOKEN'):raise SystemExit('Read-only report access is missing; no metrics inferred.')
    try:
        status,_,body=request('/api/admin/growth',token=os.environ['COMMERCE_REPORT_TOKEN'])
        if status!=200:raise ValueError('Report unavailable')
        result=sanitize(json.loads(body));status,_,body=request('/api/health');health=json.loads(body)
        code,headers,_=request('/api/checkout','POST');target=headers.get('Location',headers.get('location',''));u=urlsplit(target)
        ready=status==200 and health.get('checkout_ready') is True and health.get('mode')=='live' and code==303 and u.scheme=='https' and u.hostname=='buy.stripe.com' and not u.path.startswith('/test_')
        result['monitor']={'checkout_ready':ready,'health_status':status,'checkout_status':code,'live_payment_submitted':False,'delivery_status':'readiness checks schema and product checksum; live fulfillment awaits a genuine paid order'}
    except Exception:raise SystemExit('Growth data could not be verified. Last good report preserved.') from None
    output=Path('output/growth');output.mkdir(parents=True,exist_ok=True);stamp=datetime.now(timezone.utc).date().isoformat()
    for name in ('latest',stamp):(output/f'{name}.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    c=result['counts'];s=result['sales'];lines=['# BUILT 4 GOD AI — Growth review',result['generated_at'],'',f'Collection: {result["analytics_status"]}. Visits / previews / checkout starts: {c["visit"]} / {c["preview"]} / {c["checkout"]}.',f'Verified live orders: {s["paid_orders"]}. Gross: ${s["gross_cents"]/100:.2f}; refunds: ${s["refunded_cents"]/100:.2f}; before fees: ${s["net_before_fees_cents"]/100:.2f}.','Processor fees and net after fees: unavailable.','',result['rate_limitations'],'',f'Checkout monitor: {"PASS" if ready else "ACTION REQUIRED"}. No payment submitted.','', 'Next review: inspect preview usefulness before changing price; compare channels only after sufficient qualified traffic. Do not infer a winning channel from a small sample.','Email status: '+result['email_status']]
    (output/'latest.md').write_text('\n'.join(lines),encoding='utf-8')
    if datetime.now(timezone.utc).weekday()==0:(output/f'weekly-{stamp}.md').write_text('\n'.join(lines),encoding='utf-8')
    if not ready:raise SystemExit('Checkout monitor needs attention; report saved.')
    print('Growth report saved; live checkout monitor passed. No payment submitted.')

if __name__=='__main__':main()
