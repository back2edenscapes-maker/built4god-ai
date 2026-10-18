'use client';
import {useEffect} from 'react';
export default function Traffic(){useEffect(()=>{
  if(navigator.doNotTrack==='1'||(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl)return;
  const sources=['direct','search','reddit','indiehackers','youtube','pinterest','linkedin','referral','other','owned_social','owned_article'];
  const query=new URLSearchParams(location.search);let source=query.get('utm_source');
  if(source&&!sources.includes(source))source='other';
  try{if(!source)source=sessionStorage.getItem('b4g_source');}catch{}
  if(!source){let host='';try{host=new URL(document.referrer).hostname;}catch{}
    source=!host||host===location.hostname?'direct':/google|bing|duckduckgo/.test(host)?'search':host.endsWith('reddit.com')?'reddit':host.endsWith('indiehackers.com')?'indiehackers':host.endsWith('youtube.com')?'youtube':host.endsWith('pinterest.com')?'pinterest':host.endsWith('linkedin.com')?'linkedin':'referral';}
  try{sessionStorage.setItem('b4g_source',source);}catch{}
  for(const form of document.querySelectorAll<HTMLFormElement>('form[action="/api/checkout"]')){const input=document.createElement('input');input.type='hidden';input.name='source';input.value=source;form.appendChild(input);}
  const event=location.pathname==='/'?'visit':location.pathname==='/sample'?'preview':null;
  if(event)fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,source}),keepalive:true}).catch(()=>{});
},[]);return null;}
