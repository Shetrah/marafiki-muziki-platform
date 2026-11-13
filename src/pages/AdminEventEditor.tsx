import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  QrCode,
  Save,
  Users,
} from 'lucide-react';

import {
  createEvent,
  getEvent,
  listEventBookings,
  updateEvent,
} from '../lib/data';

import { formatDate, slugify } from '../lib/format';

import type {
  BookingWithId,
  EventDoc,
  EventStatus,
  EventWithId,
} from '../lib/types';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../lib/firebase';

const initial = {
  title: '',
  slug: '',
  description: '',
  organizer: 'Marafiki Muziki',
  eventDate: '',
  startTime: '18:00',
  endTime: '20:00',
  venue: '',
  venueNote: '',
  musicBy: '',
  posterUrl: '',
  capacity: 100,
  maxTicketsPerBooking: 4,
  bookingOpen: true,
  status: 'draft' as EventStatus,
};

export default function AdminEventEditor() {
  const { eventId } = useParams();
  const isNew = !eventId || eventId === 'new';
  const navigate = useNavigate();

  const [form, setForm] = useState(initial);
  const [event, setEvent] = useState<EventWithId | null>(null);
  const [bookings, setBookings] = useState<BookingWithId[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterFilePreview, setPosterFilePreview] = useState('');

  useEffect(() => {
    if (!posterFile) { setPosterFilePreview(''); return; }
    const preview = URL.createObjectURL(posterFile);
    setPosterFilePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [posterFile]);

  useEffect(() => {
    if (isNew) return;

    getEvent(eventId!)
      .then(async (e) => {
        if (!e) return;

        setEvent(e);

        setForm({
          title: e.title,
          slug: e.slug,
          description: e.description,
          organizer: e.organizer,
          eventDate: e.eventDate,
          startTime: e.startTime,
          endTime: e.endTime,
          venue: e.venue,
          venueNote: e.venueNote,
          musicBy: e.musicBy,
          posterUrl: e.posterUrl,
          capacity: e.capacity,
          maxTicketsPerBooking: e.maxTicketsPerBooking,
          bookingOpen: e.bookingOpen,
          status: e.status,
        });

        setBookings(await listEventBookings(e.id));
      })
      .catch((e) => setError(e.message));
  }, [eventId, isNew]);

  const left = event
    ? Math.max(event.capacity - event.reserved, 0)
    : form.capacity;

  const checkinRate = event?.reserved
    ? Math.round(((event.checkedIn || 0) / event.reserved) * 100)
    : 0;

  const canPublish =
    !!form.title &&
    !!form.eventDate &&
    !!form.venue &&
    form.capacity > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const id = isNew
        ? slugify(form.slug || form.title)
        : eventId!;

      if (!id) {
        throw new Error('Enter an event title or slug.');
      }

      let posterUrl = form.posterUrl.trim();
      if (posterFile) {
        const extension = posterFile.type === 'image/jpeg' ? 'jpg' : posterFile.type === 'image/webp' ? 'webp' : 'png';
        const posterRef = ref(storage, `events/${id}/poster.${extension}`);
        await uploadBytes(posterRef, posterFile, { contentType: posterFile.type });
        posterUrl = await getDownloadURL(posterRef);
      }
      if (posterUrl) {
        const posterHost = new URL(posterUrl).hostname;
        if (posterHost !== 'firebasestorage.googleapis.com' && posterHost !== 'storage.googleapis.com') {
          throw new Error('Event posters must be uploaded to Firebase Storage. Choose a poster file to replace this image.');
        }
      }

      const payload = {
        ...form,
        slug: slugify(form.slug || form.title),
        posterUrl,
        capacity: Number(form.capacity),
        maxTicketsPerBooking: Number(form.maxTicketsPerBooking),
      };

      if (isNew) {
        await createEvent(
          id,
          payload as Omit<
            EventDoc,
            'reserved' | 'checkedIn' | 'createdAt' | 'updatedAt'
          >
        );

        setSuccess('Event created successfully.');

        navigate(`/admin/events/${id}`, {
          replace: true,
        });
      } else {
        await updateEvent(id, payload);

        setSuccess('Event updated successfully.');

        const refreshed = await getEvent(id);
        setEvent(refreshed);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to save event.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <Link className="back-link" to="/admin/events">
            <ArrowLeft size={17} />
            All events
          </Link>

          <span className="section-tag">
            {isNew ? 'NEW EVENT' : 'EVENT CONTROL'}
          </span>

          <h1>
            {isNew
              ? 'Create event'
              : event?.title || 'Event'}
          </h1>

          <p>
            {isNew
              ? 'Build a new public event page, define slots and publish when ready.'
              : `${formatDate(event?.eventDate || '')} • ${
                  event?.venue || ''
                }`}
          </p>
        </div>

        {!isNew && event && (
          <div className="admin-head-actions">
            <Link
              className="button glass"
              target="_blank"
              to={`/events/${event.id}`}
            >
              <ExternalLink size={18} />
              Public Page
            </Link>

            <Link
              className="button primary"
              to={`/admin/events/${event.id}/scanner`}
            >
              <QrCode size={18} />
              Ticket Scanner
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {success && (
        <div className="success-box">
          {success}
        </div>
      )}

      {!isNew && event && (
        <div className="event-control-stats">
          <article>
            <span>Capacity</span>
            <strong>{event.capacity}</strong>
          </article>

          <article>
            <span>Reserved</span>
            <strong>{event.reserved}</strong>
          </article>

          <article>
            <span>Available</span>
            <strong>{left}</strong>
          </article>

          <article>
            <span>Checked In</span>
            <strong>{event.checkedIn || 0}</strong>
          </article>

          <article>
            <span>Attendance Rate</span>
            <strong>{checkinRate}%</strong>
          </article>
        </div>
      )}

      <div className="event-editor-grid">
        <form
          className="admin-panel event-form"
          onSubmit={submit}
        >
          <div className="panel-heading">
            <div>
              <h2>Event details</h2>
              <p>
                These details power the public event and
                booking pages.
              </p>
            </div>
          </div>

          <label>
            Event title

            <input
              required
              value={form.title}
              onChange={(e) =>
                setForm({
                  ...form,
                  title: e.target.value,
                  slug: isNew
                    ? slugify(e.target.value)
                    : form.slug,
                })
              }
            />
          </label>

          <label>
            URL slug

            <input
              required
              value={form.slug}
              onChange={(e) =>
                setForm({
                  ...form,
                  slug: slugify(e.target.value),
                })
              }
            />
          </label>

          <label>
            Description

            <textarea
              rows={5}
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
              placeholder="Describe the vibe, experience and what guests should expect."
            />
          </label>

          <div className="two-cols">
            <label>
              Date

              <input
                required
                type="date"
                value={form.eventDate}
                onChange={(e) =>
                  setForm({
                    ...form,
                    eventDate: e.target.value,
                  })
                }
              />
            </label>

            <label>
              Music by

              <input
                value={form.musicBy}
                onChange={(e) =>
                  setForm({
                    ...form,
                    musicBy: e.target.value,
                  })
                }
              />
            </label>
          </div>

          <div className="two-cols">
            <label>
              Start time

              <input
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm({
                    ...form,
                    startTime: e.target.value,
                  })
                }
              />
            </label>

            <label>
              End time

              <input
                type="time"
                value={form.endTime}
                onChange={(e) =>
                  setForm({
                    ...form,
                    endTime: e.target.value,
                  })
                }
              />
            </label>
          </div>

          <label>
            Venue

            <input
              required
              value={form.venue}
              onChange={(e) =>
                setForm({
                  ...form,
                  venue: e.target.value,
                })
              }
            />
          </label>

          <label>
            Venue note

            <input
              value={form.venueNote}
              onChange={(e) =>
                setForm({
                  ...form,
                  venueNote: e.target.value,
                })
              }
              placeholder="Landmark / directions"
            />
          </label>

          <div className="two-cols">
            <label>
              Total slots

              <input
                type="number"
                min={1}
                required
                value={form.capacity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    capacity: Number(e.target.value),
                  })
                }
              />
            </label>

            <label>
              Max tickets per booking

              <input
                type="number"
                min={1}
                max={10}
                value={form.maxTicketsPerBooking}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxTicketsPerBooking: Number(
                      e.target.value
                    ),
                  })
                }
              />
            </label>
          </div>

          <div className="two-cols">
            <label>
              Status

              <select
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as EventStatus,
                  })
                }
              >
                <option value="draft">
                  Draft
                </option>

                <option
                  value="published"
                  disabled={!canPublish}
                >
                  Published
                </option>

                <option value="completed">
                  Completed
                </option>

                <option value="cancelled">
                  Cancelled
                </option>
              </select>
            </label>

            <label className="switch-field">
              <span>Online booking</span>

              <input
                type="checkbox"
                checked={form.bookingOpen}
                onChange={(e) =>
                  setForm({
                    ...form,
                    bookingOpen: e.target.checked,
                  })
                }
              />
            </label>
          </div>

          {/* EVENT POSTER FILE */}
          <label>
            Upload event poster (JPG, PNG, WEBP)
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file && file.size > 10 * 1024 * 1024) { setError('Poster must be 10 MB or smaller.'); e.currentTarget.value = ''; return; }
              if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WEBP poster.'); e.currentTarget.value = ''; return; }
              setError(''); setPosterFile(file);
            }} />
            <small>The poster is uploaded to Firebase Storage when you save the event.</small>
          </label>

          {(posterFilePreview || form.posterUrl) && (
            <div>
              <p
                style={{
                  marginBottom: 8,
                  opacity: 0.7,
                  fontSize: 13,
                }}
              >
                Poster preview
              </p>

              <img
                className="poster-preview"
                src={posterFilePreview || form.posterUrl}
                alt="Event poster preview"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={(e) => {
                  e.currentTarget.style.display = 'block';
                }}
              />
            </div>
          )}

          <button
            className="button primary full"
            disabled={saving}
          >
            <Save size={18} />

            {saving
              ? 'Saving…'
              : isNew
              ? 'Create Event'
              : 'Save Changes'}
          </button>
        </form>

        <aside className="admin-panel event-side-help">
          <h2>Publishing checklist</h2>

          <ul>
            <li className={form.title ? 'done' : ''}>
              Event title
            </li>

            <li className={form.eventDate ? 'done' : ''}>
              Event date
            </li>

            <li className={form.venue ? 'done' : ''}>
              Venue
            </li>

            <li className={form.capacity > 0 ? 'done' : ''}>
              Slot capacity
            </li>

            <li className={form.posterUrl ? 'done' : ''}>
              Event poster
            </li>
          </ul>

          <p>
            Set status to <b>Published</b> when you want
            the event to appear on the public Marafiki
            Muziki website.
          </p>

          {event && (
            <>
              <hr />

              <h3>Attendance safety</h3>

              <p>
                The scanner is only available inside this
                admin area. Public users can only open the
                themed verification ticket page.
              </p>
            </>
          )}
        </aside>
      </div>

      {!isNew && event && (
        <section className="admin-panel bookings-panel">
          <div className="panel-heading">
            <div>
              <h2>Guest list</h2>

              <p>
                {bookings.length} booking record
                {bookings.length === 1 ? '' : 's'} for this
                event.
              </p>
            </div>

            <Link
              className="button glass"
              to={`/admin/events/${event.id}/scanner`}
            >
              <QrCode size={18} />
              Open Scanner
            </Link>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Qty</th>
                  <th>Ticket</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.fullName}</td>
                    <td>{b.phone}</td>
                    <td>{b.email}</td>
                    <td>{b.quantity}</td>
                    <td>{b.bookingCode}</td>

                    <td>
                      <span
                        className={
                          b.checkedIn
                            ? 'table-status checked'
                            : 'table-status'
                        }
                      >
                        {b.checkedIn
                          ? 'Checked in'
                          : 'Confirmed'}
                      </span>
                    </td>
                  </tr>
                ))}

                {bookings.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="admin-empty">
                        <Users />
                        No bookings yet.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
