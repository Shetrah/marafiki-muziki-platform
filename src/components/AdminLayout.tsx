import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, ImagePlus, LayoutDashboard, LogOut, Music2 } from 'lucide-react';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import PageTransition from './PageTransition';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  async function logout() {
    await supabase.auth.signOut();
    navigate('/admin');
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><img src="/logo.png" alt="Marafiki Muziki"/><div><strong>MARAFIKI</strong><span>ADMIN</span></div></div>
        <nav>
          <NavLink to="/admin/dashboard"><LayoutDashboard size={18}/> Dashboard</NavLink>
          <NavLink to="/admin/events"><CalendarDays size={18}/> Events</NavLink>
          <NavLink to="/admin/ai-artwork"><ImagePlus size={18}/> AI Ticket Artwork</NavLink>
          <a href="/" target="_blank" rel="noreferrer"><Music2 size={18}/> View Website</a>
        </nav>
        <button className="admin-logout" onClick={logout}><LogOut size={18}/> Sign Out</button>
      </aside>

      <section className="admin-content">
        <PageTransition className="admin-page-transition">
          <Outlet/>
        </PageTransition>
      </section>
    </div>
  );
}
