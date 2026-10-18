export const ORIGIN='https://built4god-launchready.wearebuilt4god.chatgpt.site';
export function publicMetadata(path,title,description){return {title,description,alternates:{canonical:ORIGIN+path},openGraph:{title,description,url:ORIGIN+path,siteName:'BUILT 4 GOD AI',type:'website'},twitter:{card:'summary',title,description}};}
