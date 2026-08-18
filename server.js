const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { customAlphabet } = require('nanoid');

const app = express();
const DATA_FILE = path.join(__dirname, 'data', 'receipts.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const PORT = process.env.PORT || 3000;

// ---- Simple JSON "database" helpers ----
function loadReceipts() {
  if (!fs.existsSync(DATA_FILE)) return {};
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
function saveReceipts(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

// ---- App setup ----
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.redirect('/admin/login');
}

// ---- Home: redirect root to admin ----
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// ---- Admin: login ----
app.get('/admin/login', (req, res) => {
  res.render('login', { error: null });
});
app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect('/admin');
  }
  res.render('login', { error: 'ভুল পাসওয়ার্ড' });
});
app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ---- Admin: dashboard (list + create) ----
app.get('/admin', requireLogin, (req, res) => {
  const receipts = loadReceipts();
  res.render('admin', { receipts, editing: null, baseUrl: req.protocol + '://' + req.get('host') });
});

// ---- Admin: edit existing ----
app.get('/admin/edit/:code', requireLogin, (req, res) => {
  const receipts = loadReceipts();
  const receipt = receipts[req.params.code];
  if (!receipt) return res.redirect('/admin');
  res.render('admin', { receipts, editing: { code: req.params.code, ...receipt }, baseUrl: req.protocol + '://' + req.get('host') });
});

// ---- Admin: create or update ----
app.post('/admin/save', requireLogin, (req, res) => {
  const receipts = loadReceipts();
  let code = req.body.code && req.body.code.trim();
  const isNew = !code;
  if (isNew) {
    do { code = nanoid(); } while (receipts[code]);
  }
  receipts[code] = {
    receiptNo: req.body.receiptNo || '',
    date: req.body.date || '',
    receivedFrom: req.body.receivedFrom || '',
    amount: req.body.amount || '',
    amountInWords: req.body.amountInWords || '',
    paymentMode: req.body.paymentMode || '',
    reference: req.body.reference || '',
    note: req.body.note || '',
    updatedAt: new Date().toISOString()
  };
  saveReceipts(receipts);
  res.redirect('/admin');
});

// ---- Admin: delete ----
app.post('/admin/delete/:code', requireLogin, (req, res) => {
  const receipts = loadReceipts();
  delete receipts[req.params.code];
  saveReceipts(receipts);
  res.redirect('/admin');
});

// ---- Public receipt view ----
// e.g. yourdomain.com/OSFESI
// IMPORTANT: this must stay AFTER all /admin routes, otherwise it
// intercepts paths like /admin as if they were receipt codes.
app.get('/:code', (req, res, next) => {
  const receipts = loadReceipts();
  const receipt = receipts[req.params.code];
  if (!receipt) return next(); // fall through to 404
  res.render('receipt', { receipt, code: req.params.code });
});

// ---- 404 ----
app.use((req, res) => {
  res.status(404).send('রিসিট পাওয়া যায়নি');
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin (password from ADMIN_PASSWORD env var)`);
});
