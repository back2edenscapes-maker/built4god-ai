"""Weekly acquisition scorecard from verified aggregate API data, never estimates."""
import json
from pathlib import Path

EVENTS=('visit','preview','checkout','exercise_complete')
def clean_week(value):
    from datetime import datetime
    if value is None:return None
    start=datetime.fromisoformat(value['start_utc'].replace('Z','+00:00'));end=datetime.fromisoformat(value['end_exclusive_utc'].replace('Z','+00:00'))
    if start.tzinfo is None or end.tzinfo is None or (end-start).total_seconds()!=7*86400:raise ValueError('Invalid weekly period')
    counts={k:value['counts'][k] for k in EVENTS};sales={k:value['sales'][k] for k in ('paid_orders','gross_cents','refunded_cents','net_before_fees_cents')}
    if any(type(v) is not int or v<0 for v in [*counts.values(),*sales.values()]):raise ValueError('Invalid weekly totals')
    if sales['gross_cents']-sales['refunded_cents']!=sales['net_before_fees_cents'] or value['sales']['currency']!='usd':raise ValueError('Invalid weekly reconciliation')
    return {'start_utc':start.isoformat(),'end_exclusive_utc':end.isoformat(),'counts':counts,'sales':{**sales,'currency':'usd'},'refund_basis':'Refunds currently applied to orders paid in this week; not refund-date cash flow.'}

def write_scorecard(report,output=Path('output/growth')):
    output.mkdir(parents=True,exist_ok=True);week=report.get('weekly')
    if week is None:raise ValueError('Weekly data unavailable; no scorecard inferred')
    c=week['counts'];s=week['sales'];ratio=lambda n,d:None if d==0 else n/d
    payload={'generated_at':report['generated_at'],'period':week,'analytics_started_at':report.get('analytics_started_at'),'coverage':'Partial until a full week has elapsed since analytics activation. QA/bots/reloads can be included.','event_ratios':{'checkout_starts_per_storefront_view':ratio(c['checkout'],c['visit']),'note_save_actions_per_preview_view':ratio(c['exercise_complete'],c['preview']),'paid_orders_per_storefront_view':ratio(s['paid_orders'],c['visit'])},'processor_fees_cents':None,'net_after_fees_cents':None,'qualitative_feedback_status':'Not collected by analytics. Record only voluntary, de-identified observations in marketing/phase4/feedback-log.csv.','next_action':'Approve one relevant owned-channel placement. Use the preview and one feedback question. Review after seven days; do not infer a winning segment from QA traffic.'}
    (output/'weekly-scorecard.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
    fmt=lambda v:'Unavailable (zero denominator)' if v is None else f'{v:.1%}'
    lines=['# Weekly customer acquisition scorecard',report['generated_at'],'',f'Week: {week["start_utc"]} to {week["end_exclusive_utc"]} (end excluded).',payload['coverage'],'','| Metric | Verified value |','|---|---|',f'| Storefront pageview events | {c["visit"]} |',f'| Preview pageview events | {c["preview"]} |',f'| Research-note save actions | {c["exercise_complete"]} |',f'| Checkout starts | {c["checkout"]} |',f'| Paid live orders in this week | {s["paid_orders"]} |',f'| Gross product revenue | ${s["gross_cents"]/100:.2f} |',f'| Refunds applied to those orders | ${s["refunded_cents"]/100:.2f} |',f'| Net before fees | ${s["net_before_fees_cents"]/100:.2f} |','| Processor fees / net after fees | Unavailable |',f'| Checkout starts / storefront views | {fmt(payload["event_ratios"]["checkout_starts_per_storefront_view"])} |',f'| Note saves / preview views | {fmt(payload["event_ratios"]["note_save_actions_per_preview_view"])} |','','Ratios are event ratios, not unique-customer funnels. Note-save actions do not prove completed downloads, qualified demand or purchase intent. Source categories are client supplied; segment-level attribution is not collected.','',week['refund_basis'],'',payload['qualitative_feedback_status'],'',payload['next_action']]
    (output/'weekly-scorecard.md').write_text('\n'.join(lines),encoding='utf-8')
    return payload
