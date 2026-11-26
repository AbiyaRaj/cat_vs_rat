import { useEffect, useState } from 'react';

export default function Toast({ toast }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1600);
    return () => clearTimeout(t);
  }, [toast?.id]);

  return <div id="toast" className={show ? 'show' : ''}>{toast?.msg}</div>;
}
