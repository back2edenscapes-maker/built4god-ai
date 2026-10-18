"""Zero-cost research and editorial queue. This module cannot publish externally."""
from contextlib import closing
import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from .engine import connect, scout, opportunities

UTC=timezone.utc
TOPICS=[
 ('recent-task','Ask about recent work, not hypothetical enthusiasm','What happened the last time you tried this task?','A developer is considering a tool for reviewing client CSV imports. Instead of asking whether someone likes the idea, ask a person who recently imported a file to describe the steps, the failure, and the workaround. Record the answer in their words. If they cannot name a recent occurrence, record that gap rather than treating enthusiasm as evidence.'),
 ('alternatives','Your competitor may be a spreadsheet','What does the buyer already do instead?','Write down the current workaround before comparing software competitors. For a freelancer, doing the task manually or asking a colleague may be a reasonable alternative. Compare the trigger, effort, cost and switching friction. Do not claim your offer is better until you can explain which specific part of that existing process it improves.'),
 ('price','Treat your first price as a hypothesis','What evidence would change your price?','Write down the buyer, what is included, what is excluded, and the support effort before testing a price. A price worksheet organizes your assumptions; it does not calculate willingness to pay. An actual purchase is different evidence from a compliment. Record both honestly and avoid reading a tiny sample as a market forecast.'),
 ('experiment','Give an experiment a stop condition','What would make you continue, change, or stop?','Choose one buyer problem and one observation you need next. Write the action, the time limit and the decision rule before doing the work. An interview can reveal how a task is performed; it cannot by itself prove that someone will buy your offer. Match the next experiment to the uncertainty instead of collecting more impressions.'),
 ('listing','Make the deliverable easy to inspect','Can a buyer tell what they will receive?','List file types, compatibility, license, price, delivery and support in plain language. Show a real excerpt and a clearly labeled illustrative example. If you sell a workbook, do not describe it as an automated application. Clear scope helps someone decide whether to buy and gives support a concrete promise to honor.'),
 ('launch','Test access before asking for attention','What happens after payment?','Walk through payment confirmation, the download, a lost link and a refund using a sandbox. A success page alone is not proof of payment. Keep private access references out of screenshots and analytics. Document which parts were tested and which still depend on a real customer or a sender account being configured.'),
]

def initialize(path):
    db=connect(path)
    db.executescript('''CREATE TABLE IF NOT EXISTS editorial(id TEXT PRIMARY KEY,topic TEXT UNIQUE NOT NULL,body_hash TEXT UNIQUE NOT NULL,path TEXT NOT NULL,created TEXT NOT NULL,status TEXT NOT NULL,published_url TEXT);
    CREATE TABLE IF NOT EXISTS editorial_runs(day TEXT PRIMARY KEY,generated TEXT NOT NULL);''')
    return db

def draft(topic):
    slug,title,question,example=topic
    return f'''# {title}

Status: DRAFT — human review and channel permission required. Never submit generated text where a community prohibits it.
Audience: independent software builders and freelancers.

{question}

{example}

Try this today: choose one real task from your own work, write down what you currently believe, and separate each observation from your interpretation. Then name one piece of evidence you still need. Keep the example hypothetical until actual research supports it. Do not invent interview notes or share anyone's private records.

Optional disclosed product mention, only where permitted: I am building BUILT 4 GOD AI. LaunchReady is our $9 one-time validation and launch kit with an offline workbook and editable worksheets. It helps organize this process; it does not guarantee demand or sales. Read the free sample before deciding: https://built4god-launchready.wearebuilt4god.chatgpt.site/sample?utm_source=owned_social

Review: check product accuracy, usefulness, originality, accessibility and current destination rules. No scheduled publication is authorized by this draft.
'''

def run(data_dir,output,marketing,research=True,clock=None):
    clock=clock or datetime.now(UTC);day=clock.date().isoformat();output.mkdir(parents=True,exist_ok=True)
    with closing(initialize(data_dir/'marketer.sqlite3')) as db:
        errors=scout(db) if research else []
        existing={row['topic'] for row in db.execute('SELECT topic FROM editorial')}
        produced=[]
        # At most one reviewed-topic draft per day; exhausted topics produce an honest hold.
        if not db.execute('SELECT 1 FROM editorial_runs WHERE day=?',(day,)).fetchone():
            for topic in TOPICS:
                if topic[0] in existing:continue
                body=draft(topic);identifier=hashlib.sha256(body.encode()).hexdigest()[:20]
                path=output/'drafts'/f'{identifier}.md';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(body,encoding='utf-8')
                db.execute('INSERT INTO editorial VALUES(?,?,?,?,?,?,?)',(identifier,topic[0],hashlib.sha256(body.encode()).hexdigest(),path.as_posix(),clock.isoformat(),'review_required',None));produced.append(identifier);break
            db.execute('INSERT INTO editorial_runs VALUES(?,?)',(day,clock.isoformat()))
        queue=[dict(x) for x in db.execute('SELECT id,topic,path,created,status,published_url FROM editorial ORDER BY created')]
        channels=json.loads((marketing/'channels.json').read_text(encoding='utf-8')) if (marketing/'channels.json').exists() else []
        payload={'generated_at':clock.isoformat(),'mode':'research_and_drafts_only','published_automatically':False,'new_drafts':produced,'queue':queue,'source_errors':errors,'research':opportunities(db),'channels':channels,'search_volume':None,'search_volume_note':'No authorized keyword-volume provider configured. RSS relevance is not buyer intent.','quality_status':'draft_ready_for_review' if produced else 'hold_existing_queue_or_add_new_researched_topic','next_action':'Review one useful draft and destination rules. Obtain owner approval before external publication.'}
        db.commit()
    for name in ('latest',day):(output/f'{name}.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
    lines=['# Marketer daily review',clock.isoformat(),'','Drafts only. No external publishing or unsolicited messages.','',f'New drafts: {len(produced)}. Queue: {len(queue)}. Search volume: unavailable.','RSS evidence is weak context, not proof of demand.','',f'Source errors: {json.dumps(errors)}','',payload['next_action']]
    (output/'latest.md').write_text('\n'.join(lines),encoding='utf-8')
    calendar=[{'day':i+1,'date':(clock.date()+timedelta(days=i)).isoformat(),'task':('Review one draft and channel rules; publish only after explicit approval' if i%7 in (0,2) else 'Review qualified visits, preview engagement, checkout starts and verified orders; document one uncertainty'),'automatic_publication':False} for i in range(30)]
    (output/'calendar.json').write_text(json.dumps(calendar,indent=2),encoding='utf-8')
    return payload

def record_publication(data_dir,identifier,url,approved):
    p=urlsplit(url)
    if not approved or p.scheme!='https' or not p.hostname or p.username or p.password or p.query or p.fragment:raise ValueError('Owner approval and plain HTTPS publication URL required')
    with closing(initialize(data_dir/'marketer.sqlite3')) as db:
        if db.execute("UPDATE editorial SET status='published',published_url=? WHERE id=? AND status='review_required'",(url,identifier)).rowcount!=1:raise ValueError('Unknown or already recorded draft')
        db.commit()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--data-dir',type=Path,default=Path('data'));parser.add_argument('--output-dir',type=Path,default=Path('output/marketing'));parser.add_argument('--marketing-dir',type=Path,default=Path('marketing'))
    sub=parser.add_subparsers(dest='command',required=True);sub.add_parser('run');pub=sub.add_parser('record-publication');pub.add_argument('--id',required=True);pub.add_argument('--url',required=True);pub.add_argument('--owner-approved',action='store_true');args=parser.parse_args()
    if args.command=='run':result=run(args.data_dir,args.output_dir,args.marketing_dir);print(f'Marketer prepared {len(result["new_drafts"])} draft(s). Publication requires human approval.')
    else:record_publication(args.data_dir,args.id,args.url,args.owner_approved)

if __name__=='__main__':main()
