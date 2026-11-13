import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AdminGuard() {
  const [state, setState] = useState<'loading'|'ok'|'no'>('loading');
  useEffect(() => {
    let active = true;
    const check = async (userId?: string) => {
      if (!userId) { if (active) setState('no'); return; }
      const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
      if (active) setState(!error && data?.role === 'admin' ? 'ok' : 'no');
    };
    supabase.auth.getUser().then(({ data }) => check(data.user?.id));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void check(session?.user.id); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (state === 'loading') return <div className="center-screen">Checking admin access…</div>;
  if (state === 'no') return <Navigate to="/admin" replace/>;
  return <Outlet/>;
}
