import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from built4god.engine import canonical, connect, parse_feed, now, opportunities, build, report


class EngineTests(unittest.TestCase):
    def test_canonical_dedup(self):
        self.assertEqual(canonical('https://EXAMPLE.com/a/?utm_source=x#frag'), 'https://example.com/a')
        with self.assertRaises(ValueError):
            canonical('javascript:alert(1)')

    def test_feed_freshness_and_missing_dates(self):
        clock = now()
        def feed(date):
            return f'<rss><channel><item><title>Data workflow</title><link>https://example.com/a</link>{date}</item></channel></rss>'.encode()
        self.assertEqual(len(list(parse_feed(feed(f'<pubDate>{clock.isoformat()}</pubDate>'), 'test', clock))), 1)
        self.assertFalse(list(parse_feed(feed(''), 'test', clock)))
        self.assertFalse(list(parse_feed(feed(f'<pubDate>{(clock-timedelta(days=31)).isoformat()}</pubDate>'), 'test', clock)))

    def test_persistence_builder_idempotence_and_revenue(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = connect(root / 'state.db')
            row = ('https://example.com/a', 'workflow automation', 'fixture', now().isoformat(), now().isoformat(), 'workflow')
            db.execute('INSERT INTO signals VALUES(?,?,?,?,?,?)', row)
            db.commit()
            items = opportunities(db)
            self.assertEqual(len(items), 1)
            self.assertTrue(build(db, items, root / 'products').joinpath('tracker.csv').exists())
            self.assertIsNone(build(db, items, root / 'products'))
            with self.assertRaises(Exception):
                db.execute('INSERT INTO revenue VALUES(?,?,?,?,?)', ('x', 'p', -1, 'USD', now().isoformat()))
            report(db, root / 'reports', [])
            self.assertTrue((root / 'reports/latest.md').exists())
            db.close()
            reopened = connect(root / 'state.db')
            self.assertEqual(reopened.execute('SELECT count(*) FROM products').fetchone()[0], 1)
            reopened.close()
