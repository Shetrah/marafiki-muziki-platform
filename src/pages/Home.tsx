import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Disc3, Headphones, Mic2, Music2, Sparkles, Ticket } from 'lucide-react';
import { subscribePublishedEvents } from '../lib/data';
import { formatDate, formatTimeRange } from '../lib/format';
import type { EventWithId } from '../lib/types';

export default function Home() {
  const [events, setEvents] = useState<EventWithId[]>([]);
  useEffect(() => subscribePublishedEvents(setEvents), []);
  const featured = events[0];

  return (
    <>
      <section className="brand-hero">
        <div className="hero-noise"/>
        <div className="hero-copy-wide">
          <span className="hero-kicker"><Sparkles size={17}/> LIVE • SOULFUL • HOME</span>
          <h1>Music that feels <em>like home.</em></h1>
          <p>Marafiki Muziki creates intimate live experiences where people connect, sing, laugh and leave with memories that stay long after the final note.</p>
          <div className="hero-buttons">
            <Link className="button primary" to="/events"><Ticket size={19}/> Explore Events</Link>
            <a className="button glass" href="#about"><Music2 size={19}/> Meet the Band</a>
          </div>
          <div className="sound-strip">
            <div><Mic2/><span>Live Sessions</span></div><div><Disc3/><span>Signature Vibes</span></div><div><Headphones/><span>Immersive Sound</span></div>
          </div>
        </div>
        <div className="hero-art">
          <div className="vinyl vinyl-one"><div/></div>
          <div className="vinyl vinyl-two"><div/></div>
          <img className="hero-logo" src="/logo.png" alt="Marafiki Muziki"/>
          <div className="pulse-ring r1"/><div className="pulse-ring r2"/><div className="pulse-ring r3"/>
        </div>
      </section>

      {featured && (
        <section className="featured-event section-pad">
          <div className="section-heading"><span>UP NEXT</span><h2>Your next unforgettable night.</h2><p>Reserve your place online and receive a QR e-ticket instantly.</p></div>
          <div className="featured-card">
            <div className="featured-poster"><img src={featured.posterUrl || '/poster.png'} alt={featured.title}/></div>
            <div className="featured-copy">
              <span className="event-chip">NEXT EVENT</span>
              <h3>{featured.title}</h3>
              <p>{featured.description}</p>
              <div className="event-meta-grid">
                <div><CalendarDays/><span>{formatDate(featured.eventDate)}</span></div>
                <div><Music2/><span>{formatTimeRange(featured.startTime, featured.endTime)}</span></div>
              </div>
              <div className="slot-meter"><span>{Math.max(featured.capacity-featured.reserved,0)} spaces remaining</span><div><i style={{width:`${Math.min(100,(featured.reserved/Math.max(featured.capacity,1))*100)}%`}}/></div></div>
              <Link className="button primary" to={`/events/${featured.id}`}>View Event <ArrowRight size={18}/></Link>
            </div>
          </div>
        </section>
      )}

      <section id="about" className="about-band section-pad">
        <div className="about-mark"><img src="/logo.png" alt="Marafiki Muziki"/></div>
        <div className="about-copy"><span className="section-tag">WHO WE ARE</span><h2>A band that brings you home.</h2><p>Marafiki Muziki is built around connection. Our live experiences blend musicianship, atmosphere and community into nights that feel personal rather than ordinary. We believe the best music does more than entertain — it creates belonging.</p><Link className="text-link" to="/events">See what’s coming next <ArrowRight size={17}/></Link></div>
      </section>

      <section id="sound" className="sound-section section-pad">
        <div className="section-heading centered"><span>THE MARAFIKI EXPERIENCE</span><h2>Feel every note. Live every moment.</h2></div>
        <div className="experience-grid">
          <article><div className="icon-orb"><Mic2/></div><h3>Live Music</h3><p>Authentic performances designed to feel close, warm and human.</p></article>
          <article><div className="icon-orb"><Sparkles/></div><h3>Curated Atmosphere</h3><p>Every event is shaped around mood, energy and memorable visual identity.</p></article>
          <article><div className="icon-orb"><Music2/></div><h3>Community</h3><p>Come as a guest and leave feeling like part of the Marafiki family.</p></article>
        </div>
      </section>

      <section className="events-teaser section-pad">
        <div className="section-heading"><span>EVENTS</span><h2>Choose your vibe.</h2></div>
        <div className="event-card-grid">
          {events.slice(0,3).map(event => <Link to={`/events/${event.id}`} className="public-event-card" key={event.id}><div className="event-card-image"><img src={event.posterUrl || '/poster.png'} alt={event.title}/><span>{Math.max(event.capacity-event.reserved,0)} left</span></div><div className="event-card-body"><small>{formatDate(event.eventDate)}</small><h3>{event.title}</h3><p>{event.venue}</p><div>View & book <ArrowRight size={16}/></div></div></Link>)}
          {events.length === 0 && <div className="empty-public-card"><Music2/><h3>New experiences are coming.</h3><p>Upcoming Marafiki Muziki events will appear here as soon as they are published.</p></div>}
        </div>
        {events.length > 0 && <div className="center-action"><Link className="button glass" to="/events">View All Events</Link></div>}
      </section>

      <section id="contact" className="final-cta section-pad"><div><span className="section-tag">STAY CLOSE TO THE MUSIC</span><h2>Ready for the next vibe?</h2><p>Explore our upcoming events and reserve your space before the room fills up.</p></div><Link className="button primary" to="/events">Find an Event <ArrowRight size={18}/></Link></section>
    </>
  );
}
