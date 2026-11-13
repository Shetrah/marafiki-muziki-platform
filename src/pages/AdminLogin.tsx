import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async (userId?: string) => {
      if (!userId) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
      if (active && data?.role === 'admin') navigate('/admin/dashboard', { replace: true });
    };
    supabase.auth.getUser().then(({ data }) => check(data.user?.id));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { if (active) setResetMode(true); return; }
      void check(session?.user.id);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(''); setNotice('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
      if (profileError || profile?.role !== 'admin') { await supabase.auth.signOut(); throw new Error('This account is not registered as a Marafiki Muziki administrator.'); }
      navigate('/admin/dashboard');
    } catch (reason: any) { setError(reason?.message || 'Unable to sign in.'); }
    finally { setLoading(false); }
  }

  async function sendReset() {
    setLoading(true); setError(''); setNotice('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin` });
      if (resetError) throw resetError;
      setNotice('If this email belongs to an account, a password reset link has been sent.');
    } catch (reason: any) { setError(reason?.message || 'Could not request a password reset.'); }
    finally { setLoading(false); }
  }

  async function finishReset(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setResetMode(false); setPassword(''); setNotice('Password updated. Sign in with your new password.');
      await supabase.auth.signOut();
    } catch (reason: any) { setError(reason?.message || 'Could not update the password.'); }
    finally { setLoading(false); }
  }

  return <div className="admin-login-page page-transition"><div className="admin-login-card"><img src="/logo.png" alt="Marafiki Muziki"/><span className="section-tag">PRIVATE ADMIN ACCESS</span><h1>{resetMode ? 'Reset password.' : 'Welcome back.'}</h1><p>This page is intentionally hidden from the public website navigation.</p>
    {resetMode ? <form onSubmit={finishReset}><label>New password<input type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}/></label>{error&&<div className="error-box">{error}</div>}<button className="button primary full" disabled={loading}>{loading?'Updating…':'Update Password'}</button></form> : <form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)}/></label><label>Password<input type="password" required value={password} onChange={(e)=>setPassword(e.target.value)}/></label>{error&&<div className="error-box">{error}</div>}{notice&&<div className="success-box">{notice}</div>}<button className="button primary full" disabled={loading}><LockKeyhole size={18}/>{loading?'Signing in…':'Admin Sign In'}</button><button className="text-link" type="button" disabled={loading||!email} onClick={sendReset}>Forgot or migrated your password?</button></form>}
  </div></div>;
}
