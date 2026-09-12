import { Link, NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/">
          <img src="/logo.png" alt="Marafiki Muziki" />
          <div>
            <strong>MARAFIKI MUZIKI</strong>
            <span>A Band That Brings You Home</span>
          </div>
        </Link>
        <nav>
          <NavLink to="/">Event</NavLink>
          <NavLink to="/book">Book</NavLink>
          <NavLink to="/scanner">Scanner</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
      </header>
      <main><Outlet /></main>
      <footer>
        <div className="footer-brand">
          <img src="/logo.png" alt="Marafiki Muziki" />
          <div>
            <strong>Marafiki Muziki</strong>
            <span>A Band That Brings You Home</span>
          </div>
        </div>
        <p>Book online, verify at the gate, and manage slots in real time.</p>
      </footer>
    </div>
  );
}
