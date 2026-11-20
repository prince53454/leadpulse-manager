import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.VERCEL ? path.join('/tmp', 'leadpulse.db') : path.join(__dirname, 'leads.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  company TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Website',
  status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Contacted','Qualified','Lost')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS lead_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('Call','Email','Meeting','Note')),
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_activities_lead ON lead_activities(lead_id, created_at DESC)');
db.exec('CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)');
db.exec('CREATE INDEX IF NOT EXISTS idx_leads_name ON leads(name COLLATE NOCASE)');
const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));
const statuses = ['New', 'Contacted', 'Qualified', 'Lost'];
const sources = ['Website', 'Referral', 'LinkedIn', 'Cold call', 'Event', 'Other'];
function validate(body) {
  const errors = {};
  for (const key of ['name','email','phone','company']) {
    if (typeof body[key] !== 'string' || !body[key].trim()) errors[key] = 'This field is required.';
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) errors.email = 'Enter a valid email address.';
  if (body.status && !statuses.includes(body.status)) errors.status = 'Choose a valid status.';
  if (body.source && !sources.includes(body.source)) errors.source = 'Choose a valid source.';
  if (body.phone && body.phone.trim().length > 30) errors.phone = 'Phone must be 30 characters or fewer.';
  return errors;
}
const columns = ['name','email','phone','company','source','status'];
app.get('/api/health', (_req,res) => res.json({ ok:true }));
app.get('/api/leads', (req,res) => {
  const q = String(req.query.search || '').trim();
  const status = String(req.query.status || '');
  if (status && !statuses.includes(status)) return res.status(400).json({ error:'Invalid status filter.' });
  let sql = 'SELECT * FROM leads WHERE 1=1'; const args=[];
  if (q) { sql += ' AND (name LIKE ? COLLATE NOCASE OR status LIKE ? COLLATE NOCASE)'; args.push(`%${q}%`,`%${q}%`); }
  if (status) { sql += ' AND status = ?'; args.push(status); }
  sql += ' ORDER BY created_at DESC, id DESC';
  const leads = db.prepare(sql).all(...args);
  const counts = Object.fromEntries(statuses.map(s => [s, db.prepare('SELECT COUNT(*) AS n FROM leads WHERE status = ?').get(s).n]));
  res.json({ leads, counts, total: Object.values(counts).reduce((a,b)=>a+b,0) });
});
app.post('/api/leads', (req,res) => {
  const errors = validate(req.body || {}); if (Object.keys(errors).length) return res.status(400).json({ error:'Please correct the highlighted fields.', fields:errors });
  const data = Object.fromEntries(columns.map(k => [k, (req.body[k] ?? (k==='source'?'Website':k==='status'?'New':'')).trim()]));
  const result = db.prepare(`INSERT INTO leads (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(k=>data[k]));
  res.status(201).json(db.prepare('SELECT * FROM leads WHERE id=?').get(result.lastInsertRowid));
});
app.put('/api/leads/:id', (req,res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id < 1) return res.status(400).json({error:'Invalid lead ID.'});
  if (!db.prepare('SELECT id FROM leads WHERE id=?').get(id)) return res.status(404).json({error:'Lead not found.'});
  const errors=validate(req.body || {}); if(Object.keys(errors).length) return res.status(400).json({error:'Please correct the highlighted fields.',fields:errors});
  const data=Object.fromEntries(columns.map(k=>[k,(req.body[k]??'').trim()]));
  db.prepare(`UPDATE leads SET ${columns.map(k=>`${k}=@${k}`).join(',')}, updated_at=datetime('now') WHERE id=@id`).run({...data,id});
  res.json(db.prepare('SELECT * FROM leads WHERE id=?').get(id));
});
app.get('/api/leads/:id/activities', (req,res) => {
  const id=Number(req.params.id);
  if (!db.prepare('SELECT id FROM leads WHERE id=?').get(id)) return res.status(404).json({error:'Lead not found.'});
  res.json(db.prepare('SELECT * FROM lead_activities WHERE lead_id=? ORDER BY created_at DESC, id DESC').all(id));
});
app.post('/api/leads/:id/activities', (req,res) => {
  const leadId=Number(req.params.id); const body=req.body || {};
  if (!db.prepare('SELECT id FROM leads WHERE id=?').get(leadId)) return res.status(404).json({error:'Lead not found.'});
  const types=['Call','Email','Meeting','Note'];
  const errors={};
  if (!types.includes(body.type)) errors.type='Choose an activity type.';
  if (typeof body.title !== 'string' || !body.title.trim()) errors.title='Add a short activity summary.';
  if (typeof body.details === 'string' && body.details.length > 2000) errors.details='Details must be 2,000 characters or fewer.';
  if (Object.keys(errors).length) return res.status(400).json({error:'Please correct the activity details.',fields:errors});
  const result=db.prepare('INSERT INTO lead_activities (lead_id,type,title,details) VALUES (?,?,?,?)').run(leadId,body.type,body.title.trim(),(body.details||'').trim());
  res.status(201).json(db.prepare('SELECT * FROM lead_activities WHERE id=?').get(result.lastInsertRowid));
});
app.delete('/api/leads/:id', (req,res) => {
  const id=Number(req.params.id); const result=db.prepare('DELETE FROM leads WHERE id=?').run(id);
  if (!result.changes) return res.status(404).json({error:'Lead not found.'});
  res.status(204).end();
});
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({error:'Something went wrong. Please try again.'}); });
export default app;
