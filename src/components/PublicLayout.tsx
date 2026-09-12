import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Music2, Ticket, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageTransition from './PageTransition';

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="site-shell">
      <header className="public-header">
        <Link to="/" className="public-brand" onClick={() => setOpen(false)}>
          <img src="/logo.png" alt="Marafiki Muziki" />
          <div><strong>MARAFIKI MUZIKI</strong><span>A Band That Brings You Home</span></div>
        </Link>
        <button
          className="menu-toggle"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
          aria-expanded={open}
        >
          {open ? <X/> : <Menu/>}
        </button>
        <nav className={open ? 'public-nav open' : 'public-nav'}>
          <NavLink to="/" end onClick={() => setOpen(false)}>Home</NavLink>
          <NavLink to="/events" onClick={() => setOpen(false)}>Events</NavLink>
          <a href="/#about" onClick={() => setOpen(false)}>About</a>
          <a href="/#sound" onClick={() => setOpen(false)}>Our Sound</a>
          <a href="/#contact" onClick={() => setOpen(false)}>Contact</a>
          <Link to="/events" className="nav-cta" onClick={() => setOpen(false)}><Ticket size={17}/> Book an Event</Link>
        </nav>
      </header>

      <main>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <footer className="public-footer">
        <div className="footer-brand"><img src="/logo.png" alt="Marafiki Muziki"/><div><strong>MARAFIKI MUZIKI</strong><span>A Band That Brings You Home</span></div></div>
        <div className="footer-copy"><Music2 size={18}/><span>Live music • intimate experiences • memorable nights</span></div>
        <span>© {new Date().getFullYear()} Marafiki Muziki</span>
      </footer>
    </div>
  );
}
