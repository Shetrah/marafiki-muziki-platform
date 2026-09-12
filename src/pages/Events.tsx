import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, MapPin, Music2 } from 'lucide-react';
import { subscribePublishedEvents } from '../lib/data';
import { formatDate, formatTimeRange } from '../lib/format';
import type { EventWithId } from '../lib/types';

export default function Events() {
  const [events, setEvents] = useState<EventWithId[]>([]);
  const [error, setError] = useState('');
  useEffect(() => subscribePublishedEvents(setEvents, setError), []);
  return <section className="events-page section-pad">
    <div className="page-hero"><span className="section-tag">MARAFIKI EVENTS</span><h1>Find your next <em>vibe.</em></h1><p>Every event has its own character. Choose the night that feels like yours and reserve your place online.</p></div>
    {error && <div className="error-box">{error}</div>}
    <div className="events-list-grid">
      {events.map(event => {
        const left = Math.max(event.capacity-event.reserved,0);
        return <article className="event-list-card" key={event.id}>
          <Link to={`/events/${event.id}`} className="event-list-poster"><img src={event.posterUrl || '/poster.png'} alt={event.title}/><span className={left === 0 ? 'sold-out-badge' : 'spaces-badge'}>{left === 0 ? 'SOLD OUT' : `${left} SPACES LEFT`}</span></Link>
          <div className="event-list-info"><small>{formatDate(event.eventDate)}</small><h2>{event.title}</h2><p>{event.description}</p><div className="event-info-lines"><span><CalendarDays/> {formatTimeRange(event.startTime,event.endTime)}</span><span><MapPin/> {event.venue}</span><span><Music2/> {event.musicBy}</span></div><Link className="button primary" to={`/events/${event.id}`}>{left === 0 ? 'View Event' : 'Book Your Space'} <ArrowRight size={18}/></Link></div>
        </article>;
      })}
      {events.length === 0 && !error && <div className="empty-public-card"><Music2/><h3>No published events yet.</h3><p>Check back soon for the next Marafiki Muziki experience.</p></div>}
    </div>
  </section>;
}
