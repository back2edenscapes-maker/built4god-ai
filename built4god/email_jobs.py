"""Retry transactional email only; never export addresses or access links."""
import json
import os
from .growth import request

def main():
    token=os.environ.get('COMMERCE_JOB_TOKEN')
    if not token:raise SystemExit('Email retry credential is missing.')
    status,_,body=request('/api/jobs/email','POST',token)
    if status!=200:raise SystemExit('Email retry endpoint failed.')
    data=json.loads(body)
    if data.get('status') not in ('configured','not_configured') or type(data.get('sent')) is not int:raise SystemExit('Unexpected job result.')
    print(f'Transactional email: {data["status"]}; acknowledged sends this run: {data["sent"]}.')

if __name__=='__main__':main()
