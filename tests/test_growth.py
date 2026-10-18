from contextlib import closing
import tempfile
import unittest
from datetime import datetime,timezone,timedelta
from pathlib import Path
from built4god.marketer import run,record_publication,initialize
from built4god.growth import sanitize

class GrowthTests(unittest.TestCase):
 def test_daily_drafts_deduplicate_and_publication_requires_approval(self):
  with tempfile.TemporaryDirectory() as folder:
   base=Path(folder);clock=datetime(2026,10,18,tzinfo=timezone.utc)
   first=run(base,base/'out',base,research=False,clock=clock)
   second=run(base,base/'out',base,research=False,clock=clock)
   third=run(base,base/'out',base,research=False,clock=clock+timedelta(days=1))
   self.assertEqual(len(first['new_drafts']),1);self.assertEqual(second['new_drafts'],[]);self.assertNotEqual(first['new_drafts'],third['new_drafts'])
   identifier=first['new_drafts'][0]
   with self.assertRaises(ValueError):record_publication(base,identifier,'https://example.com/post',False)
   record_publication(base,identifier,'https://example.com/post',True)
   with closing(initialize(base/'marketer.sqlite3')) as db:self.assertEqual(db.execute('SELECT status FROM editorial WHERE id=?',(identifier,)).fetchone()[0],'published')
 def test_growth_sanitizes_unknown_private_fields_and_rejects_invalid_amounts(self):
  fixture={'generated_at':'2026-10-18T00:00:00Z','analytics_status':'collecting','analytics_started_at':'2026-10-18T00:00:00Z','email_status':'disabled','counts':dict(visit=0,preview=0,checkout=0),'traffic':[],'sales':dict(paid_orders=0,gross_cents=0,refunded_cents=0,net_before_fees_cents=0,currency='usd',customer_email='private@example.test'),'private_token':'never export'}
  result=sanitize(fixture);self.assertNotIn('private',str(result));self.assertIsNone(result['sales']['processor_fees_cents'])
  fixture['sales']['gross_cents']=1
  with self.assertRaises(ValueError):sanitize(fixture)

if __name__=='__main__':unittest.main()

class ScorecardTests(unittest.TestCase):
 def test_weekly_validation_and_zero_denominators(self):
  from built4god.scorecard import clean_week,write_scorecard
  week={'start_utc':'2026-10-12T00:00:00Z','end_exclusive_utc':'2026-10-19T00:00:00Z','counts':dict(visit=0,preview=0,checkout=0,exercise_complete=0),'sales':dict(paid_orders=0,gross_cents=0,refunded_cents=0,net_before_fees_cents=0,currency='usd'),'customer_email':'never export'}
  cleaned=clean_week(week);self.assertNotIn('customer_email',str(cleaned))
  with tempfile.TemporaryDirectory() as folder:
   result=write_scorecard({'generated_at':'2026-10-18T00:00:00Z','weekly':cleaned},Path(folder));self.assertIsNone(result['event_ratios']['paid_orders_per_storefront_view'])
  week['sales']['net_before_fees_cents']=1
  with self.assertRaises(ValueError):clean_week(week)
