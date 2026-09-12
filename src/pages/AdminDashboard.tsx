import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Gauge, Ticket, Users, ArrowRight } from 'lucide-react';
import { subscribeAllEvents } from '../lib/data';
import { formatDate } from '../lib/format';
import type { EventWithId } from '../lib/types';

export default function AdminDashboard(){
  const [events,setEvents]=useState<EventWithId[]>([]); const [error,setError]=useState('');
  useEffect(()=>subscribeAllEvents(setEvents,setError),[]);
  const totals=useMemo(()=>events.reduce((a,e)=>({capacity:a.capacity+e.capacity,reserved:a.reserved+e.reserved,checkedIn:a.checkedIn+(e.checkedIn||0)}),{capacity:0,reserved:0,checkedIn:0}),[events]);
  const attendanceRate=totals.reserved?Math.round((totals.checkedIn/totals.reserved)*100):0;
  return <>
    <div className="admin-page-head"><div><span className="section-tag">OVERVIEW</span><h1>Dashboard</h1><p>Track every Marafiki Muziki event, bookings and attendance from one place.</p></div><Link className="button primary" to="/admin/events/new">+ Create Event</Link></div>
    {error&&<div className="error-box">{error}</div>}
    <div className="admin-stat-grid"><article><CalendarDays/><div><span>Events</span><strong>{events.length}</strong></div></article><article><Users/><div><span>Total Capacity</span><strong>{totals.capacity}</strong></div></article><article><Ticket/><div><span>Booked Slots</span><strong>{totals.reserved}</strong></div></article><article><CheckCircle2/><div><span>Attendance</span><strong>{totals.checkedIn}</strong></div></article><article><Gauge/><div><span>Attendance Rate</span><strong>{attendanceRate}%</strong></div></article></div>
    <section className="admin-panel"><div className="panel-heading"><div><h2>Event attendance</h2><p>A simple view of booked guests compared with actual check-ins.</p></div></div><div className="attendance-chart">{events.map(e=>{const reservedPct=e.capacity?Math.min(100,(e.reserved/e.capacity)*100):0;const checkPct=e.capacity?Math.min(100,((e.checkedIn||0)/e.capacity)*100):0;return <div className="attendance-row" key={e.id}><div className="attendance-name"><strong>{e.title}</strong><span>{formatDate(e.eventDate)}</span></div><div className="bar-set"><div className="bar-track"><i className="bar-booked" style={{width:`${reservedPct}%`}}/><i className="bar-attended" style={{width:`${checkPct}%`}}/></div><small>{e.checkedIn||0} attended / {e.reserved} booked / {e.capacity} capacity</small></div><Link to={`/admin/events/${e.id}`}><ArrowRight/></Link></div>})}{events.length===0&&<div className="admin-empty">No events yet. Create your first event to start tracking attendance.</div>}</div><div className="chart-legend"><span><i className="legend-booked"/> Booked</span><span><i className="legend-attended"/> Checked in</span></div></section>
    <section className="admin-panel"><div className="panel-heading"><div><h2>Recent / upcoming events</h2><p>Quick access to event management.</p></div><Link className="text-link" to="/admin/events">All events <ArrowRight size={16}/></Link></div><div className="admin-event-list">{events.slice(0,6).map(e=><Link key={e.id} to={`/admin/events/${e.id}`} className="admin-event-row"><img src={e.posterUrl||'/poster.png'}/><div><strong>{e.title}</strong><span>{formatDate(e.eventDate)} • {e.venue}</span></div><div><b>{e.reserved}/{e.capacity}</b><span>reserved</span></div><div><b>{e.checkedIn||0}</b><span>checked in</span></div><ArrowRight/></Link>)}</div></section>
  </>
}
