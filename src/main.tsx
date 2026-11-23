import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './theme.css';
import './readability.css';

createRoot(document.getElementById('root')!).render(<App/>);

if('serviceWorker' in navigator && import.meta.env.PROD){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js').then(reg=>{
      const announce=()=>{if(reg.waiting)window.dispatchEvent(new CustomEvent('app-update',{detail:reg}));};
      announce();reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',announce));
      document.addEventListener('visibilitychange',()=>{if(!document.hidden){void reg.update().catch(()=>{});announce();}});
    }).catch(()=>window.dispatchEvent(new Event('offline-cache-failed')));
  });
}
