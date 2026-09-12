import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { LockKeyhole } from 'lucide-react';
import { auth, db } from '../lib/firebase';

export default function AdminLogin(){
  const navigate=useNavigate();
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
  useEffect(()=>onAuthStateChanged(auth,async user=>{if(user&&!user.isAnonymous){const admin=await getDoc(doc(db,'admins',user.uid));if(admin.exists()) navigate('/admin/dashboard',{replace:true});}}),[navigate]);
  async function submit(e:FormEvent){e.preventDefault();setLoading(true);setError('');try{const cred=await signInWithEmailAndPassword(auth,email,password);const admin=await getDoc(doc(db,'admins',cred.user.uid));if(!admin.exists()){await signOut(auth);throw new Error('This account is not registered as a Marafiki Muziki administrator.');}navigate('/admin/dashboard');}catch(err:any){setError(err?.message||'Unable to sign in.');}finally{setLoading(false)}}
  return <div className="admin-login-page"><div className="admin-login-card"><img src="/logo.png" alt="Marafiki Muziki"/><span className="section-tag">PRIVATE ADMIN ACCESS</span><h1>Welcome back.</h1><p>This page is intentionally hidden from the public website navigation.</p><form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="error-box">{error}</div>}<button className="button primary full" disabled={loading}><LockKeyhole size={18}/>{loading?'Signing in…':'Admin Sign In'}</button></form></div></div>
}
