require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool, init, STATUS_OPTIONS, SERVICE_OPTIONS } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'sf-tracking-dev-secret-change-me';

app.set('view engine', 'ejs');
app.set('views', __dirname);
app.use(express.urlencoded({ extended: true }));
// Templates and assets live flat in the repo root (no views/ or public/
// subfolders), so serve the stylesheet explicitly instead of a static dir.
app.get('/css/style.css', (req, res) => {
  res.type('text/css');
  res.sendFile(path.join(__dirname, 'style.css'));
});
app.get('/sf-logo.png.webp', (req, res) => {
  res.type('image/webp');
  res.sendFile(path.join(__dirname, 'sf-logo.png.webp'));
});

app.use(session({
  store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

// ---------- Public tracking pages ----------

app.get('/', async (req, res) => {
  const raw = (req.query.awb || '').trim();
  if (!raw) {
    return res.render('index', { query: '', waybill: null, events: [], notFound: false });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM waybills WHERE tracking_number = $1',
      [raw.toUpperCase()]
    );
    if (rows.length === 0) {
      return res.render('index', { query: raw, waybill: null, events: [], notFound: true });
    }
    const waybill = rows[0];
    const eventsRes = await pool.query(
      'SELECT * FROM tracking_events WHERE waybill_id = $1 ORDER BY event_time DESC',
      [waybill.id]
    );
    return res.render('index', { query: raw, waybill, events: eventsRes.rows, notFound: false });
  } catch (err) {
    console.error(err);
    return res.status(500).render('index', { query: raw, waybill: null, events: [], notFound: true });
  }
});

// ---------- Admin auth ----------

app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  return res.render('login', { error: 'Invalid username or password.' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ---------- Admin dashboard ----------

app.get('/admin', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const result = await pool.query(
      `SELECT * FROM waybills WHERE tracking_number ILIKE $1 OR receiver_name ILIKE $1 ORDER BY updated_at DESC`,
      [`%${q}%`]
    );
    rows = result.rows;
  } else {
    const result = await pool.query('SELECT * FROM waybills ORDER BY updated_at DESC LIMIT 200');
    rows = result.rows;
  }
  res.render('dashboard', { waybills: rows, q });
});

app.get('/admin/waybills/new', requireAuth, (req, res) => {
  res.render('waybill_form', {
    waybill: null,
    events: [],
    STATUS_OPTIONS,
    SERVICE_OPTIONS,
    error: null
  });
});

app.post('/admin/waybills', requireAuth, async (req, res) => {
  const {
    tracking_number, sender_name, sender_location, receiver_name, receiver_location,
    service_type, pieces, weight_kg, current_status, estimated_delivery
  } = req.body;

  if (!tracking_number || !tracking_number.trim()) {
    return res.render('waybill_form', {
      waybill: req.body, events: [], STATUS_OPTIONS, SERVICE_OPTIONS,
      error: 'Tracking number is required.'
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO waybills
        (tracking_number, sender_name, sender_location, receiver_name, receiver_location,
         service_type, pieces, weight_kg, current_status, estimated_delivery)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        tracking_number.trim().toUpperCase(), sender_name || null, sender_location || null,
        receiver_name || null, receiver_location || null, service_type || null,
        pieces ? parseInt(pieces, 10) : null, weight_kg ? parseFloat(weight_kg) : null,
        current_status || 'Information Received', estimated_delivery || null
      ]
    );
    res.redirect(`/admin/waybills/${result.rows[0].id}/edit`);
  } catch (err) {
    console.error(err);
    let error = 'Something went wrong while saving.';
    if (err.code === '23505') error = 'A waybill with this tracking number already exists.';
    res.render('waybill_form', {
      waybill: req.body, events: [], STATUS_OPTIONS, SERVICE_OPTIONS, error
    });
  }
});

app.get('/admin/waybills/:id/edit', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM waybills WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.redirect('/admin');
  const eventsRes = await pool.query(
    'SELECT * FROM tracking_events WHERE waybill_id = $1 ORDER BY event_time DESC',
    [req.params.id]
  );
  res.render('waybill_form', {
    waybill: rows[0], events: eventsRes.rows, STATUS_OPTIONS, SERVICE_OPTIONS, error: null
  });
});

app.post('/admin/waybills/:id', requireAuth, async (req, res) => {
  const {
    tracking_number, sender_name, sender_location, receiver_name, receiver_location,
    service_type, pieces, weight_kg, current_status, estimated_delivery
  } = req.body;

  try {
    await pool.query(
      `UPDATE waybills SET
        tracking_number=$1, sender_name=$2, sender_location=$3, receiver_name=$4,
        receiver_location=$5, service_type=$6, pieces=$7, weight_kg=$8,
        current_status=$9, estimated_delivery=$10, updated_at=now()
       WHERE id=$11`,
      [
        tracking_number.trim().toUpperCase(), sender_name || null, sender_location || null,
        receiver_name || null, receiver_location || null, service_type || null,
        pieces ? parseInt(pieces, 10) : null, weight_kg ? parseFloat(weight_kg) : null,
        current_status || 'Information Received', estimated_delivery || null, req.params.id
      ]
    );
    res.redirect(`/admin/waybills/${req.params.id}/edit`);
  } catch (err) {
    console.error(err);
    const eventsRes = await pool.query(
      'SELECT * FROM tracking_events WHERE waybill_id = $1 ORDER BY event_time DESC',
      [req.params.id]
    );
    let error = 'Something went wrong while saving.';
    if (err.code === '23505') error = 'A waybill with this tracking number already exists.';
    res.render('waybill_form', {
      waybill: { ...req.body, id: req.params.id }, events: eventsRes.rows,
      STATUS_OPTIONS, SERVICE_OPTIONS, error
    });
  }
});

app.post('/admin/waybills/:id/delete', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM waybills WHERE id = $1', [req.params.id]);
  res.redirect('/admin');
});

app.post('/admin/waybills/:id/events', requireAuth, async (req, res) => {
  const { event_time, location, status, description } = req.body;
  if (event_time && status) {
    await pool.query(
      `INSERT INTO tracking_events (waybill_id, event_time, location, status, description)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, event_time, location || null, status, description || null]
    );
    // Current status always reflects whichever event has the latest event_time,
    // regardless of the order events were entered in.
    const latest = await pool.query(
      'SELECT status FROM tracking_events WHERE waybill_id = $1 ORDER BY event_time DESC LIMIT 1',
      [req.params.id]
    );
    await pool.query('UPDATE waybills SET current_status=$1, updated_at=now() WHERE id=$2', [latest.rows[0].status, req.params.id]);
  }
  res.redirect(`/admin/waybills/${req.params.id}/edit`);
});

app.post('/admin/waybills/:id/events/:eventId/delete', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM tracking_events WHERE id = $1 AND waybill_id = $2', [req.params.eventId, req.params.id]);
  const latest = await pool.query(
    'SELECT status FROM tracking_events WHERE waybill_id = $1 ORDER BY event_time DESC LIMIT 1',
    [req.params.id]
  );
  if (latest.rows.length > 0) {
    await pool.query('UPDATE waybills SET current_status=$1, updated_at=now() WHERE id=$2', [latest.rows[0].status, req.params.id]);
  }
  res.redirect(`/admin/waybills/${req.params.id}/edit`);
});

app.get('/healthz', (req, res) => res.send('ok'));

init()
  .then(() => {
    app.listen(PORT, () => console.log(`SF Tracking server listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database', err);
    process.exit(1);
  });
