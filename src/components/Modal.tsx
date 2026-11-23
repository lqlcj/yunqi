import { useEffect,useRef,type ReactNode } from 'react';
import { Icon } from './Icon';
export function Modal({title,children,onClose}: {title:string;children:ReactNode;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{el?.close();document.body.style.overflow=old;};},[]);
  return <dialog ref={ref} className="modal" onCancel={e=>{e.preventDefault();onClose();}} aria-labelledby="modal-title"><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><Icon name="close"/></button></div>{children}</dialog>;
}
