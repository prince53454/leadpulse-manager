import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

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
if (!db.prepare('SELECT id FROM leads LIMIT 1').get()) {
  const examples = [
    ['Olivia Rhye','olivia@example.com','+1 (415) 555-0132','Acme Corporation','Website','New'],
    ['Phoenix Baker','phoenix@example.com','+1 (415) 555-0187','Layered Systems','Referral','Contacted'],
    ['Lana Steiner','lana@example.com','+1 (212) 555-0109','Cloudline','LinkedIn','Qualified'],
    ['Demi Wilkinson','demi@example.com','+1 (312) 555-0164','Northstar Labs','Event','New'],
    ['Candice Wu','candice@example.com','+1 (646) 555-0195','Orbit Analytics','Cold call','Contacted'],
    ['Natali Craig','natali@example.com','+1 (206) 555-0118','Evergreen Health','Referral','Lost'],
    ['Drew Cano','drew@example.com','+1 (512) 555-0140','Vertex Digital','Website','Qualified'],
    ['Andi Lane','andi@example.com','+1 (617) 555-0173','BrightPath','LinkedIn','New']
  ];
  const insertExample = db.prepare('INSERT INTO leads (name,email,phone,company,source,status) VALUES (?,?,?,?,?,?)');
  for (const example of examples) insertExample.run(...example);
}
const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
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
const pageTemplate = readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const escapeHtml = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = value => new Date(`${value.replace(' ','T')}Z`).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
const selected = (actual, value) => actual === value ? 'selected' : '';
function sourceOptions(value='Website') { return sources.map(s=>`<option ${selected(value,s)}>${escapeHtml(s)}</option>`).join(''); }
function statusOptions(name='status', value='New', style='radio') {
  return statuses.map(s=>style==='radio'
    ? `<label class="status-choice ${s.toLowerCase()}"><input type="radio" name="${name}" value="${s}" ${selected(value,s)} ${value===s?'checked':''}><span>${s}</span></label>`
    : `<option ${selected(value,s)}>${s}</option>`).join('');
}
function renderEdit(lead) {
  if (!lead) return '';
  return `<div class="modal-layer"><a class="modal-scrim" href="/" aria-label="Close edit form"></a><section class="modal-panel"><header class="modal-head"><div><small>LEAD MANAGEMENT</small><h2>Edit ${escapeHtml(lead.name)}</h2><p>Update contact details and qualification status.</p></div><a class="close-button" href="/" aria-label="Close">×</a></header><form class="lead-form" action="/leads/${lead.id}/edit" method="post"><h3><span>01</span> CONTACT INFORMATION</h3><label>Full name <i>*</i><input name="name" value="${escapeHtml(lead.name)}" required maxlength="120"></label><label>Work email <i>*</i><input type="email" name="email" value="${escapeHtml(lead.email)}" required maxlength="254"></label><div class="form-grid"><label>Phone number <i>*</i><input name="phone" value="${escapeHtml(lead.phone)}" required maxlength="30"></label><label>Company <i>*</i><input name="company" value="${escapeHtml(lead.company)}" required maxlength="160"></label></div><h3><span>02</span> LEAD DETAILS</h3><label>Lead source<select name="source">${sourceOptions(lead.source)}</select></label><label>Pipeline status<select name="status">${statusOptions('status',lead.status,'select')}</select></label><div class="drawer-footer"><a class="button outline" href="/">Cancel</a><button class="button primary">Save changes →</button></div></form></section></div>`;
}
function renderActivity(lead) {
  if (!lead) return '';
  const items=db.prepare('SELECT * FROM lead_activities WHERE lead_id=? ORDER BY created_at DESC,id DESC').all(lead.id);
  return `<div class="modal-layer"><a class="modal-scrim" href="/" aria-label="Close timeline"></a><section class="activity-modal"><header class="modal-head"><div><small>LEAD ENGAGEMENT</small><h2>${escapeHtml(lead.name)}</h2><p>${escapeHtml(lead.company)} · Activity timeline</p></div><a class="close-button" href="/" aria-label="Close">×</a></header><div class="activity-summary"><b>${escapeHtml(lead.email)}</b><span>${escapeHtml(lead.phone)}</span><span class="badge ${lead.status.toLowerCase()}">${lead.status}</span></div><div class="activity-content"><form class="activity-form" action="/leads/${lead.id}/activities" method="post"><h3>＋ LOG A TOUCHPOINT</h3><label>Activity type<select name="type"><option>Call</option><option>Email</option><option>Meeting</option><option>Note</option></select></label><label>Summary<input name="title" required maxlength="160" placeholder="What happened?"></label><label>Details<textarea name="details" rows="3" maxlength="2000" placeholder="Add notes, outcomes, or next steps"></textarea></label><button class="button primary">Add to timeline →</button></form><section class="timeline"><h3>↻ RECENT ACTIVITY</h3><article class="timeline-item"><i class="created-dot"></i><div><b>Lead created</b><time>${dateLabel(lead.created_at)}</time><p>${escapeHtml(lead.name)} was added from ${escapeHtml(lead.source)}.</p></div></article>${items.map(a=>`<article class="timeline-item"><i class="${a.type.toLowerCase()}-dot"></i><div><b>${escapeHtml(a.title)}</b><time>${dateLabel(a.created_at)} · ${a.type}</time>${a.details?`<p>${escapeHtml(a.details)}</p>`:''}</div></article>`).join('')}</section></div></section></div>`;
}
function renderDelete(lead) {
  if (!lead) return '';
  return `<div class="modal-layer"><a class="modal-scrim" href="/" aria-label="Close delete confirmation"></a><section class="delete-modal"><header class="modal-head"><div><small class="danger-text">DESTRUCTIVE OPERATION</small><h2>Delete Lead: ${escapeHtml(lead.name)}</h2></div><a class="close-button" href="/" aria-label="Close">×</a></header><div class="delete-warning"><b>Critical warning</b><p>This permanently removes this lead and its timeline. This action cannot be undone.</p></div><div class="record-card"><span>Lead</span><b>${escapeHtml(lead.name)}</b><span>Company</span><b>${escapeHtml(lead.company)}</b><span>Work email</span><b>${escapeHtml(lead.email)}</b><span>Status</span><b>${escapeHtml(lead.status)}</b></div><form action="/leads/${lead.id}/delete" method="post"><label>To verify, type <b>DELETE</b> below:<input name="confirm" required pattern="DELETE" title="Type DELETE exactly to confirm"></label><label class="acknowledge"><input type="checkbox" name="acknowledge" required>I understand this action is irreversible.</label><div class="drawer-footer"><a class="button outline" href="/">Cancel</a><button class="button destructive">Confirm and delete</button></div></form></section></div>`;
}
function renderRow(lead,index) {
  return `<tr><td><div class="person"><span class="person-avatar av-${index%6}">${escapeHtml(lead.name.split(/\s+/).map(n=>n[0]).join('').slice(0,2).toUpperCase())}</span><span><a class="person-name" href="/?activity=${lead.id}">${escapeHtml(lead.name)}</a><a class="person-email" href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></span></div></td><td>${escapeHtml(lead.company)}</td><td><a class="phone-link" href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a></td><td>${escapeHtml(lead.source)}</td><td><span class="badge ${lead.status.toLowerCase()}"><i></i>${lead.status}</span></td><td>${dateLabel(lead.created_at)}</td><td><div class="row-actions"><a href="/?activity=${lead.id}" aria-label="Activity">◷</a><a href="/?edit=${lead.id}" aria-label="Edit lead">✎</a><a class="danger" href="/?delete=${lead.id}" aria-label="Delete lead">⌫</a></div><div class="mobile-actions"><a href="tel:${escapeHtml(lead.phone)}">Call</a><a href="mailto:${escapeHtml(lead.email)}">Email</a><a href="/?edit=${lead.id}">Edit</a><a class="danger" href="/?delete=${lead.id}">Delete</a></div></td></tr>`;
}
function renderPipeline(leads) {
  return `<section class="pipeline">${statuses.map(s=>{const subset=leads.filter(l=>l.status===s);return `<section class="pipe-column"><header><span class="badge ${s.toLowerCase()}"><i></i>${s}</span><b>${subset.length}</b></header>${subset.map(l=>`<a class="pipe-card" href="/?activity=${l.id}"><strong>${escapeHtml(l.name)}</strong><span>${escapeHtml(l.company)}</span><small>${escapeHtml(l.email)}</small><footer>${escapeHtml(l.source)} <span>→</span></footer></a>`).join('')||'<p class="pipe-empty">No leads in this stage.</p>'}</section>`}).join('')}</section>`;
}
function renderPage(req,res) {
  const q=String(req.query.search||'').trim();const status=String(req.query.status||'');const view=req.query.view==='pipeline'?'pipeline':'leads';const sort=String(req.query.sort||'newest');
  let sql='SELECT * FROM leads WHERE 1=1';const args=[];
  if(q){sql+=' AND (name LIKE ? COLLATE NOCASE OR status LIKE ? COLLATE NOCASE)';args.push(`%${q}%`,`%${q}%`)}
  if(statuses.includes(status)){sql+=' AND status=?';args.push(status)}
  const order={name:'name COLLATE NOCASE ASC',company:'company COLLATE NOCASE ASC',oldest:'id ASC',newest:'id DESC'}[sort]||'id DESC';sql+=` ORDER BY ${order}`;
  const leads=db.prepare(sql).all(...args);const counts=Object.fromEntries(statuses.map(s=>[s,db.prepare('SELECT COUNT(*) AS n FROM leads WHERE status=?').get(s).n]));const total=Object.values(counts).reduce((a,b)=>a+b,0);
  const metrics=`<a class="metric ${!status?'selected':''}" href="/"><span class="metric-icon blue">▦</span><span class="metric-label">Total leads</span><strong>${total}</strong><small>Across all stages</small></a>${statuses.map(s=>`<a class="metric ${status===s?'selected':''}" href="/?status=${s}"><span class="metric-icon ${s.toLowerCase()}">${s==='New'?'✦':s==='Contacted'?'↗':s==='Qualified'?'✓':'⊘'}</span><span class="metric-label">${s}</span><strong>${counts[s]}</strong><small>${s==='New'?'Awaiting outreach':s==='Contacted'?'In conversation':s==='Qualified'?'High intent':'Closed out'}</small></a>`).join('')}`;
  const mainContent=view==='pipeline'?renderPipeline(leads):`<section class="table-card"><div class="table-toolbar"><div><h2>All leads <span class="count-pill">${leads.length}</span></h2><p>Your complete list of prospects and customers.</p></div><form class="toolbar-right" action="/" method="get"><input type="search" name="search" value="${escapeHtml(q)}" placeholder="Search name or status" aria-label="Search name or status"><select name="status" aria-label="Filter by status"><option value="">All statuses</option>${statusOptions('status',status,'select')}</select><select name="sort" aria-label="Sort leads"><option value="newest" ${selected(sort,'newest')}>Newest first</option><option value="oldest" ${selected(sort,'oldest')}>Oldest first</option><option value="name" ${selected(sort,'name')}>Name A–Z</option><option value="company" ${selected(sort,'company')}>Company A–Z</option></select><button class="button outline">Apply</button></form></div><div class="table-wrap"><table><thead><tr><th>LEAD</th><th>COMPANY</th><th>PHONE</th><th>SOURCE</th><th>STATUS</th><th>ADDED</th><th>ACTIONS</th></tr></thead><tbody>${leads.map(renderRow).join('')}</tbody></table>${leads.length?'':`<div class="empty"><div class="empty-icon">⌕</div><strong>${q||status?'No matching leads':'No leads yet'}</strong><p>${q||status?'Try another search or clear the filters.':'Add your first lead to get started.'}</p><a class="button primary" href="/?add=1#add-lead">＋ Add lead</a></div>`}</div><footer class="table-footer"><span>Showing <b>${leads.length}</b> ${leads.length===1?'lead':'leads'}</span><span>LeadPulse workspace · Local database</span></footer></section>`;
  const edit=renderEdit(db.prepare('SELECT * FROM leads WHERE id=?').get(Number(req.query.edit)));
  const activity=renderActivity(db.prepare('SELECT * FROM leads WHERE id=?').get(Number(req.query.activity)));
  const deleting=renderDelete(db.prepare('SELECT * FROM leads WHERE id=?').get(Number(req.query.delete)));
  const notice=req.query.notice?`<p class="notice">${escapeHtml(req.query.notice)}</p>`:'';
  const html=pageTemplate.replaceAll('{{LEADS_ACTIVE}}',view==='leads'?'active':'').replaceAll('{{PIPELINE_ACTIVE}}',view==='pipeline'?'active':'').replace('{{SEARCH}}',escapeHtml(q)).replace('{{VIEW}}',view).replace('{{CREATE_OPEN}}',req.query.add==='1'?'open':'').replace('{{BREADCRUMB}}',view==='pipeline'?'SALES PIPELINE':'LEAD MANAGEMENT').replace('{{PAGE_TITLE}}',view==='pipeline'?'Pipeline Overview':'Leads & Opportunities').replace('{{METRICS}}',metrics).replace('{{NOTICE}}',notice).replace('{{MAIN_CONTENT}}',mainContent).replace('{{SOURCE_OPTIONS}}',sourceOptions()).replace('{{CREATE_STATUS_OPTIONS}}',statusOptions()).replace('{{MODAL}}',edit||activity||deleting||'');
  res.status(200).type('html').send(html);
}
app.get('/', renderPage);
app.post('/leads', (req,res) => {
  const errors=validate(req.body||{});
  if(Object.keys(errors).length) return res.redirect(303,'/?notice='+encodeURIComponent('Please complete the required fields with a valid email.'));
  const data=Object.fromEntries(columns.map(k=>[k,String(req.body[k]??(k==='source'?'Website':k==='status'?'New':'')).trim()]));
  db.prepare(`INSERT INTO leads (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(k=>data[k]));
  res.redirect(303,'/?notice='+encodeURIComponent('Lead added successfully.'));
});
app.post('/leads/:id/edit', (req,res) => {
  const id=Number(req.params.id);if(!db.prepare('SELECT id FROM leads WHERE id=?').get(id))return res.status(404).send('Lead not found.');
  const errors=validate(req.body||{});if(Object.keys(errors).length)return res.redirect(303,'/?notice='+encodeURIComponent('Please complete the required fields with a valid email.'));
  const data=Object.fromEntries(columns.map(k=>[k,String(req.body[k]??'').trim()]));
  db.prepare(`UPDATE leads SET ${columns.map(k=>`${k}=@${k}`).join(',')},updated_at=datetime('now') WHERE id=@id`).run({...data,id});
  res.redirect(303,'/?notice='+encodeURIComponent('Lead updated successfully.'));
});
app.post('/leads/:id/delete', (req,res) => {
  if(req.body.confirm!=='DELETE'||req.body.acknowledge!=='on')return res.redirect(303,'/?notice='+encodeURIComponent('Confirm the safety phrase and checkbox to delete.'));
  const result=db.prepare('DELETE FROM leads WHERE id=?').run(Number(req.params.id));
  if(!result.changes)return res.status(404).send('Lead not found.');
  res.redirect(303,'/?notice='+encodeURIComponent('Lead deleted.'));
});
app.post('/leads/:id/activities', (req,res) => {
  const leadId=Number(req.params.id);if(!db.prepare('SELECT id FROM leads WHERE id=?').get(leadId))return res.status(404).send('Lead not found.');
  const {type,title,details=''}=req.body||{};if(!['Call','Email','Meeting','Note'].includes(type)||!String(title||'').trim()||String(details).length>2000)return res.redirect(303,`/?activity=${leadId}&notice=`+encodeURIComponent('Add a valid activity summary.'));
  db.prepare('INSERT INTO lead_activities (lead_id,type,title,details) VALUES (?,?,?,?)').run(leadId,type,String(title).trim(),String(details).trim());
  res.redirect(303,'/?activity='+leadId+'&notice='+encodeURIComponent('Activity added to the timeline.'));
});
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

