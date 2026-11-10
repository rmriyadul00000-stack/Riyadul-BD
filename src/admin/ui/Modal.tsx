import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* Same markup and classes as the original modal, so admin.css applies unchanged. */
export function Modal({ title, onClose, footer, wide, children }: {
  title: string; onClose: () => void; footer?: ReactNode; wide?: boolean; children: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <>
      <div className="scrim on" onClick={onClose} />
      <div className={'modal on' + (wide ? ' xl' : '')} role="dialog" aria-modal="true" aria-label={title} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal-card">
          <div className="modal-head"><h2 style={{ fontSize: '1.15rem' }}>{title}</h2><button className="x" aria-label="Close" onClick={onClose}>×</button></div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      </div>
    </>,
    document.body
  );
}
