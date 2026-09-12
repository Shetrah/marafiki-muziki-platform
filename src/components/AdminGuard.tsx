import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export default function AdminGuard() {
  const [state, setState] = useState<'loading'|'ok'|'no'>('loading');
  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user || user.isAnonymous) return setState('no');
    const admin = await getDoc(doc(db, 'admins', user.uid));
    setState(admin.exists() ? 'ok' : 'no');
  }), []);
  if (state === 'loading') return <div className="center-screen">Checking admin access…</div>;
  if (state === 'no') return <Navigate to="/admin" replace/>;
  return <Outlet/>;
}
