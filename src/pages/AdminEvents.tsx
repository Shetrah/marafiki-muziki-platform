import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Plus } from 'lucide-react';
import { subscribeAllEvents } from '../lib/data';
import { formatDate } from '../lib/format';
import type { EventWithId } from '../lib/types';

export default function AdminEvents(){
 const [events,setEvents]=useState<EventWithId[]>([]); const [error,setError]=useState(''); useEffect(()=>subscribeAllEvents(setEvents,setError),[]);
 return <><div className="admin-page-head"><div><span className="section-tag">EVENT MANAGEMENT</span><h1>Events</h1><p>Create, publish, edit and monitor every event.</p></div><Link className="button primary" to="/admin/events/new"><Plus size={18}/> Create Event</Link></div>{error&&<div className="error-box">{error}</div>}<div className="manage-event-grid">{events.map(e=><Link to={`/admin/events/${e.id}`} key={e.id} className="manage-event-card"><img src={e.posterUrl||'/poster.png'} alt={e.title}/><div><span className={`event-status ${e.status}`}>{e.status}</span><h3>{e.title}</h3><p><CalendarDays size={16}/>{formatDate(e.eventDate)}</p><div className="manage-numbers"><span><b>{e.reserved}</b> booked</span><span><b>{e.checkedIn||0}</b> attended</span><span><b>{Math.max(e.capacity-e.reserved,0)}</b> left</span></div><strong className="manage-link">Manage event <ArrowRight size={17}/></strong></div></Link>)}{events.length===0&&<div className="admin-empty">No events yet.</div>}</div></>
}
