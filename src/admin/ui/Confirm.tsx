import { useState } from 'react';
import { Modal } from './Modal';

export function ConfirmDelete({ what, onConfirm, onClose }: { what: string; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={'Delete ' + what} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Keep it</button>
        <button className="btn red" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); onClose(); }}>Delete</button>
      </>}>
      <p>This removes <b>{what}</b> for good. There is no undo.</p>
    </Modal>
  );
}
