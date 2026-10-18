"""Pull only aggregate, verified commerce totals; never commit customer records."""
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit


def validate(payload):
    if payload.get('source') != 'verified_stripe_webhooks' or payload.get('fees_included') is not False:
        raise ValueError('Unrecognized revenue source')
    totals=[]
    for row in payload.get('totals', []):
        currency=row.get('currency')
        if currency != 'usd':
            raise ValueError('Unexpected currency')
        fields=('paid_orders','gross_cents','refunded_cents','net_before_fees_cents')
        if any(type(row.get(k)) is not int or row[k] < 0 for k in fields):
            raise ValueError('Invalid amount')
        if row['gross_cents']-row['refunded_cents'] != row['net_before_fees_cents']:
            raise ValueError('Totals do not reconcile')
        totals.append({'currency':currency,**{k:row[k] for k in fields}})
    return {'generated_at':payload['generated_at'],'source':'verified_stripe_webhooks','totals':totals,'fees_included':False}


def main():
    url=os.environ.get('COMMERCE_SITE_URL','').rstrip('/')
    token=os.environ.get('COMMERCE_REPORT_TOKEN','')
    if not url or not token:
        raise SystemExit('Commerce reporting is not configured; no sales totals were inferred.')
    parsed=urlsplit(url)
    if parsed.scheme!='https' or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise SystemExit('Commerce URL must be a plain HTTPS origin')
    headers={'Authorization':f'Bearer {token}'}
    if os.environ.get('COMMERCE_SITE_SERVICE_TOKEN'):
        headers['OAI-Sites-Authorization']='Bearer '+os.environ['COMMERCE_SITE_SERVICE_TOKEN']
    request=urllib.request.Request(url+'/api/admin/revenue',headers=headers)
    try:
        with urllib.request.urlopen(request,timeout=30) as response:
            body=response.read(1_000_001)
        if len(body)>1_000_000:
            raise ValueError('Report too large')
        result=validate(json.loads(body))
    except Exception:
        raise SystemExit('Commerce report could not be verified. No report was overwritten.') from None
    output=Path('output/revenue')
    output.mkdir(parents=True,exist_ok=True)
    for name in ('latest',datetime.now(timezone.utc).strftime('%Y-%m-%d')):
        (output/f'{name}.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(f'Verified {len(result["totals"])} currency totals. No customer records exported.')


if __name__=='__main__':
    main()
