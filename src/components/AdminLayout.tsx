import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CalendarDays, LayoutDashboard, LogOut, Music2 } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function AdminLayout() {
  const navigate = useNavigate();
  async function logout() {
    await signOut(auth);
    navigate('/admin');
  }
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><img src="/logo.png" alt="Marafiki Muziki"/><div><strong>MARAFIKI</strong><span>ADMIN</span></div></div>
        <nav>
          <NavLink to="/admin/dashboard"><LayoutDashboard size={18}/> Dashboard</NavLink>
          <NavLink to="/admin/events"><CalendarDays size={18}/> Events</NavLink>
          <a href="/" target="_blank" rel="noreferrer"><Music2 size={18}/> View Website</a>
        </nav>
        <button className="admin-logout" onClick={logout}><LogOut size={18}/> Sign Out</button>
      </aside>
      <section className="admin-content"><Outlet/></section>
    </div>
  );
}
