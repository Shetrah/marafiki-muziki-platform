import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeAllEvents } from '../lib/data';
import type { EventWithId } from '../lib/types';

type ArtworkResult = { pngPath: string; pdfPath: string; pngUrl: string; pdfUrl: string; model: string };

export default function AdminArtwork() {
  const [events, setEvents] = useState<EventWithId[]>([]);
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState(20);
  const [usedCalls, setUsedCalls] = useState(0);
  const [maxVariations, setMaxVariations] = useState(3);
  const [tier, setTier] = useState<'premium' | 'standard'>('premium');
  const [variations, setVariations] = useState(1);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ArtworkResult[]>([]);

  useEffect(() => subscribeAllEvents((items) => {
    setEvents(items);
    setEventId((current) => current || items[0]?.id || '');
  }, setError), []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error: readError } = await supabase.from('artwork_budgets').select('*').eq('id', true).maybeSingle();
      if (!active) return;
      if (readError) { setError(readError.message); return; }
      if (data) { setEnabled(data.enabled); setMonthlyBudget(data.max_calls_per_month); setMaxVariations(data.max_variations_per_request); setUsedCalls(data.used_calls); }
    };
    void load();
    const channel = supabase.channel('artwork-budget').on('postgres_changes', { event: '*', schema: 'public', table: 'artwork_budgets' }, () => { void load(); }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, []);

  async function saveBudget() {
    setError(''); setSuccess('');
    try {
      const { error: updateError } = await supabase.from('artwork_budgets').update({
        enabled,
        max_calls_per_month: Math.max(0, Math.min(500, monthlyBudget)),
        max_variations_per_request: Math.max(1, Math.min(3, maxVariations)),
      }).eq('id', true);
      if (updateError) throw updateError;
      setSuccess('Generation budget saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the budget.'); }
  }

  async function generate() {
    setBusy(true); setError(''); setSuccess(''); setResults([]);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('generate-ticket-artwork', { body: { eventId, model: tier, variations } });
      if (invokeError) throw invokeError;
      setResults((data as { results: ArtworkResult[] }).results);
      setSuccess('Artwork variations generated. Preview or download the files below.');
    } catch (reason: any) { setError(reason?.message || 'Artwork generation failed.'); }
    finally { setBusy(false); }
  }

  const selectedEvent = events.find((item) => item.id === eventId);

  return <>
    <div className="admin-page-head"><div><span className="section-tag">GEMINI IMAGE GENERATION</span><h1>AI Ticket Artwork</h1><p>Generate poster inspired artwork for an event. The uploaded Supabase Storage poster is the design reference.</p></div></div>
    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}
    <section className="admin-panel" style={{ maxWidth: 850 }}>
      <h2>Generation budget</h2>
      <p>Gemini image calls can incur charges. Generation is disabled until enabled here. Failed attempts may consume the reserved budget.</p>
      <label className="admin-form-label" style={{ display: 'flex', gap: 12, alignItems: 'center' }}><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Allow paid image generation</label>
      <div className="form-grid two">
        <label className="admin-form-label">Monthly Gemini call limit<input type="number" min={0} max={500} value={monthlyBudget} onChange={(e) => setMonthlyBudget(Number(e.target.value))} /><small>Used this month: {usedCalls} / {monthlyBudget}</small></label>
        <label className="admin-form-label">Maximum variations per request<input type="number" min={1} max={3} value={maxVariations} onChange={(e) => setMaxVariations(Number(e.target.value))} /></label>
      </div>
      <button className="button glass" type="button" onClick={saveBudget}>Save budget</button>
    </section>
    <section className="admin-panel" style={{ maxWidth: 850, marginTop: 20 }}>
      <h2>Generate variations</h2>
      <div className="form-grid two">
        <label className="admin-form-label">Event<select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">Choose event</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label className="admin-form-label">Model<select value={tier} onChange={(e) => setTier(e.target.value as 'premium' | 'standard')}><option value="premium">Premium · Gemini 3 Pro Image</option><option value="standard">Standard · Gemini 3.1 Flash Image</option></select></label>
        <label className="admin-form-label">Variations<select value={variations} onChange={(e) => setVariations(Number(e.target.value))}>{[1,2,3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      {selectedEvent?.posterUrl ? <img src={selectedEvent.posterUrl} alt={`${selectedEvent.title} poster reference`} style={{ display: 'block', width: 260, maxHeight: 300, objectFit: 'contain', margin: '14px 0' }} /> : <p>Upload a poster in the event editor before generating artwork.</p>}
      <button className="button primary" type="button" disabled={!enabled || !eventId || !selectedEvent?.posterUrl || busy || variations > maxVariations} onClick={generate}>{busy ? 'Generating…' : 'Generate artwork'}</button>
      {results.length > 0 && <div style={{ marginTop: 18 }}>{results.map((item, index) => <p key={item.pngPath}>Variation {index + 1} · {item.model} · <a href={item.pngUrl} target="_blank" rel="noreferrer">Preview PNG</a> · <a href={item.pdfUrl} target="_blank" rel="noreferrer">Download PDF</a></p>)}</div>}
    </section>
  </>;
}
