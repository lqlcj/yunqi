import type { CSSProperties } from 'react';
const paths:Record<string,string>={
  moon:'M20.9 13.3A9 9 0 0 1 10.7 3.1 9 9 0 1 0 20.9 13.3Z',
  monitor:'M3 4h18v13H3V4Zm5 17h8m-4-4v4',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  home:'m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7',
  drop:'M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Zm-3 12a3 3 0 0 0 3 3',
  pulse:'M2 12h5l3-7 4 14 3-7h5',
  timer:'M9 2h6m-3 0v3m7 1 2 2M12 9v5l3 2M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  history:'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',
  report:'M6 3h9l4 4v14H5V3h1Zm8 0v5h5M8 17v-4m4 4v-7m4 7v-5',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',arrow:'M5 12h14m-5-5 5 5-5 5',
  check:'m5 12 4 4L19 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  cloud:'M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11M9 14l3-3 3 3m-3-3v10',
  wifi:'M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0m-3 4h.01',
  info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  lock:'M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4m-4 5v2',
  calendar:'M4 5h16v16H4V5Zm3-3v6m10-6v6M4 10h16',
  chevron:'m9 5 7 7-7 7',sun:'M12 3V1m0 22v-2M3 12H1m22 0h-2M5 5 3 3m18 18-2-2M5 19l-2 2M19 5l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  edit:'m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  print:'M7 8V3h10v5M7 16H3V8h18v8h-4M7 13h10v8H7v-8Zm10-2h.01',
  leaf:'M20 3C7 2 2 9 6 16s13 3 14-13ZM4 21 15 9',refresh:'M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5',
};
export function Icon({name,size=22,className='',style}: {name:string;size?:number;className?:string;style?:CSSProperties}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true"><path d={paths[name]??paths.heart}/></svg>;
}
