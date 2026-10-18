import unittest
from built4god.revenue import validate


class RevenueTests(unittest.TestCase):
    def test_aggregates_strip_customer_fields(self):
        data={'source':'verified_stripe_webhooks','fees_included':False,'generated_at':'2026-10-18T00:00:00Z','customer_email':'private@example.test','totals':[{'currency':'usd','paid_orders':2,'gross_cents':1800,'refunded_cents':900,'net_before_fees_cents':900,'session_id':'private'}]}
        result=validate(data)
        self.assertNotIn('customer_email',result)
        self.assertNotIn('session_id',result['totals'][0])
        data['totals'][0]['net_before_fees_cents']=1800
        with self.assertRaises(ValueError):validate(data)

    def test_unverified_source_is_rejected(self):
        with self.assertRaises(ValueError):validate({'source':'demo','fees_included':False})
