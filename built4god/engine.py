import argparse
import json
import sqlite3
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

UTC = timezone.utc
SOURCES = {'GitHub Blog': 'https://github.blog/feed/', 'Hacker News RSS': 'https://hnrss.org/newest?points=50'}
NICHES = {
    'workflow': ('Workflow planning toolkit', ('automation', 'workflow', 'productivity', 'spreadsheet')),
    'data': ('Data quality checklist and tracking workbook', ('data', 'csv', 'analytics', 'database')),
    'software': ('Small software project launch toolkit', ('developer', 'software', 'open source', 'api')),
}


def now():
    return datetime.now(UTC)


def canonical(url):
    p = urlsplit(url.strip())
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise ValueError('Invalid public evidence URL')
    query = urlencode([(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith('utm_')])
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip('/'), query, ''))


def connect(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript('''
    CREATE TABLE IF NOT EXISTS signals(url TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL,
      published TEXT NOT NULL, seen TEXT NOT NULL, niche TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products(niche TEXT PRIMARY KEY, created TEXT NOT NULL, path TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revenue(reference TEXT PRIMARY KEY, product TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), currency TEXT NOT NULL, recorded TEXT NOT NULL);
    ''')
    return db


def parse_feed(data, source, clock):
    root = ET.fromstring(data)
    nodes = root.findall('.//item') + root.findall('{http://www.w3.org/2005/Atom}entry')
    for node in nodes[:80]:
        title = node.findtext('title') or node.findtext('{http://www.w3.org/2005/Atom}title') or ''
        link = node.findtext('link')
        if not link:
            el = node.find('{http://www.w3.org/2005/Atom}link')
            link = el.get('href') if el is not None else None
        date = node.findtext('pubDate') or node.findtext('{http://www.w3.org/2005/Atom}published') or node.findtext('{http://www.w3.org/2005/Atom}updated')
        if not title or not link or not date:
            continue
        try:
            try:
                published = parsedate_to_datetime(date)
            except ValueError:
                published = datetime.fromisoformat(date.replace('Z', '+00:00'))
            if published.tzinfo is None:
                continue
            published = published.astimezone(UTC)
            if not clock - timedelta(days=30) <= published <= clock + timedelta(hours=1):
                continue
            url = canonical(link)
        except (ValueError, TypeError):
            continue
        for niche, (_, words) in NICHES.items():
            if any(word in title.lower() for word in words):
                yield (url, title[:500], source, published.isoformat(), clock.isoformat(), niche)
                break


def scout(db):
    errors = []
    clock = now()
    for source, url in SOURCES.items():
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Built4GodAI/1.0 RSS research'})
            with urllib.request.urlopen(request, timeout=20) as response:
                data = response.read(5_000_001)
            if len(data) > 5_000_000:
                raise ValueError('Feed exceeds size limit')
            rows = list(parse_feed(data, source, clock))
            with db:
                db.executemany('INSERT INTO signals VALUES(?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET seen=excluded.seen', rows)
        except Exception as exc:
            errors.append({'source': source, 'error': f'{type(exc).__name__}: {str(exc)[:180]}'})
    return errors


def opportunities(db):
    rows = db.execute('SELECT * FROM signals WHERE published >= ? ORDER BY published DESC', ((now()-timedelta(days=30)).isoformat(),)).fetchall()
    result = []
    for niche, (title, _) in NICHES.items():
        evidence = [dict(r) for r in rows if r['niche'] == niche]
        if not evidence:
            continue
        # A heuristic research priority, never a sales or income prediction.
        dimensions = {'startup_cost': 5, 'competition': 1, 'automation_feasibility': 4,
                      'potential_revenue': 1, 'speed_to_launch': 5}
        signal_score = min(len(evidence), 5)
        result.append({'id': niche, 'title': title, 'score': sum(dimensions.values()) + signal_score,
                       'dimensions_1_to_5': dimensions, 'demand_signal_count': len(evidence),
                       'competition_status': 'unverified', 'revenue_status': 'unverified',
                       'startup_cost_usd': 0, 'evidence': evidence,
                       'validation_required': 'News relevance is not purchase intent. Interview buyers and compare alternatives before listing.'})
    return sorted(result, key=lambda x: (-x['score'], x['id']))


def report(db, output, errors):
    output.mkdir(parents=True, exist_ok=True)
    items = opportunities(db)
    totals = [dict(r) for r in db.execute('SELECT currency, SUM(amount_cents) AS amount_cents FROM revenue GROUP BY currency')]
    payload = {'generated_at': now().isoformat(), 'opportunities': items, 'source_errors': errors,
               'verified_manual_revenue': totals, 'note': 'Heuristic leads, not validated businesses or earnings forecasts.'}
    stamp = now().strftime('%Y-%m-%d')
    for name in ('latest', stamp):
        (output / f'{name}.json').write_text(json.dumps(payload, indent=2), encoding='utf-8')
        lines = ['# BUILT 4 GOD AI — Scout report', payload['generated_at'], payload['note'], '']
        for item in items:
            lines += [f"## {item['title']} — priority {item['score']}/30", item['validation_required']]
            lines += [f"- [{e['title']}]({e['url']}) ({e['source']}, {e['published']})" for e in item['evidence']]
        lines += ['', '## Source errors', json.dumps(errors), '', '## Recorded revenue', json.dumps(totals)]
        (output / f'{name}.md').write_text('\n'.join(lines), encoding='utf-8')
    return items


def build(db, items, output):
    for item in items:
        if db.execute('SELECT 1 FROM products WHERE niche=?', (item['id'],)).fetchone():
            continue
        folder = output / item['id']
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'tracker.csv').write_text('Task,Owner,Due date,Status,Evidence,Next action\nDefine buyer,,,,,\nValidate problem,,,,,\nTest solution,,,,,\nReview quality,,,,,\n', encoding='utf-8')
        (folder / 'guide.md').write_text(f"# {item['title']}\n\nDraft for human review.\n\n1. Define one buyer and one recurring task.\n2. Record the current process in tracker.csv.\n3. Measure time and errors before changing it.\n4. Test one improvement with a small sample.\n5. Record evidence, owner, due date, and next action.\n6. Review results weekly and retain only useful changes.\n\n## Buyer interview\n- What happened the last time you did this task?\n- What did the problem cost in time?\n- What have you already tried?\n- Would this workbook solve that specific problem?\n\n## Publication checklist\n- Customize with niche-specific examples.\n- Test every instruction and open the CSV.\n- Confirm all content is original or licensed.\n- Validate demand and check selling platform rules.\n- State exactly what buyers receive, price, support and refund terms.\n", encoding='utf-8')
        (folder / 'manifest.json').write_text(json.dumps({'status': 'draft_needs_review', 'opportunity': item, 'published': False}, indent=2), encoding='utf-8')
        with db:
            db.execute('INSERT INTO products VALUES(?,?,?)', (item['id'], now().isoformat(), str(folder)))
        return folder


def main():
    parser = argparse.ArgumentParser(description='BUILT 4 GOD AI — free research and product drafting')
    parser.add_argument('--data-dir', type=Path, default=Path('data'))
    parser.add_argument('--output-dir', type=Path, default=Path('output'))
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('run')
    sub.add_parser('report')
    sale = sub.add_parser('record-sale')
    sale.add_argument('--reference', required=True)
    sale.add_argument('--product', required=True)
    sale.add_argument('--amount-cents', type=int, required=True)
    sale.add_argument('--currency', required=True, choices=['USD', 'EUR', 'GBP', 'CAD'])
    args = parser.parse_args()
    with connect(args.data_dir / 'engine.sqlite3') as db:
        if args.command == 'record-sale':
            if args.amount_cents <= 0:
                parser.error('Sale amount must be positive; use actual completed payment records only')
            db.execute('INSERT INTO revenue VALUES(?,?,?,?,?)', (args.reference, args.product, args.amount_cents, args.currency, now().isoformat()))
            return
        errors = scout(db) if args.command == 'run' else []
        items = report(db, args.output_dir / 'reports', errors)
        if args.command == 'run':
            product = build(db, items, args.output_dir / 'products')
            print(json.dumps({'opportunities': len(items), 'source_errors': errors, 'draft': str(product) if product else None}))
            if len(errors) == len(SOURCES):
                raise SystemExit('All sources failed; reports retain prior fresh evidence')

