const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();
const atlasCredentialsPath = path.join(__dirname, 'atlas-credentials.env');
if (!process.env.MONGODB_URI && fs.existsSync(atlasCredentialsPath)) {
  dotenv.config({ path: atlasCredentialsPath });
}
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { refreshSkillDemand } = require('./skill-demand');
const { trainingCentres } = require('./training-centres-data');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/auth_app';

// Log every incoming request so we can see in the terminal whether it
// actually reaches Express at all (helps tell "request never arrived"
// apart from "request arrived but something crashed before responding").
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.static(__dirname));

app.use('/api', (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    if (req.method === 'GET' && req.path === '/training-centres') return next();
    return res.status(503).json({ message: 'Database is unavailable. Start MongoDB and try again.' });
  }
  next();
});

// If the client sends malformed JSON, express.json() throws before your
// route ever runs. Without this handler that could otherwise result in
// the connection closing with no response body (looks like ERR_EMPTY_RESPONSE
// in the browser) instead of a clean error message.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('Bad JSON body:', err.message);
    return res.status(400).json({ message: 'Malformed request. Try again.' });
  }
  next(err);
});

/* ---------- Database model ---------- */
const userSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    fatherName: { type: String, required: true, trim: true },
    location:   { type: String, required: true, trim: true },
    phone:      { type: String, required: true, trim: true },
    email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    profession: { type: String, required: true, trim: true },
    password:   { type: String, required: true }, // bcrypt hash, never the plain password
    savedJobs:  { type: [Number], default: [] },
    appliedJobs: {
      type: [{
        jobId: { type: Number, required: true },
        appliedAt: { type: Date, default: Date.now },
        status: { type: String, default: 'Applied' }
      }],
      default: []
    }
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);
const skillDemandSchema = new mongoose.Schema({
  skill_name: { type: String, required: true, unique: true, trim: true },
  demand_count: { type: Number, required: true, min: 1 },
  source_date: { type: Date, required: true },
  last_updated: { type: Date, required: true },
  source_information: { type: [{ title: String, url: String }], default: [] }
});
const SkillDemand = mongoose.model('SkillDemand', skillDemandSchema);

const trainingCentreSchema = new mongoose.Schema(
  {
    name:          { type: String, required: true, unique: true, trim: true },
    address:       { type: String, required: true, trim: true },
    area:          { type: String, trim: true },
    city:          { type: String, required: true, trim: true, default: 'Trichy' },
    pincode:       { type: String, required: true, trim: true },
    established:   { type: Number, required: true },
    courses:       { type: [String], default: [] },
    email:         { type: String, trim: true, lowercase: true },
    phones:        { type: [String], default: [] },
    directionsUrl: { type: String, trim: true },
    imageUrl:      { type: String, default: null }
  },
  { timestamps: true }
);
const TrainingCentre = mongoose.model('TrainingCentre', trainingCentreSchema);

async function seedTrainingCentres() {
  try {
    await TrainingCentre.bulkWrite(trainingCentres.map((centre) => ({
      updateOne: { filter: { name: centre.name }, update: { $set: centre }, upsert: true }
    })));
    console.log(`Training centres synced: ${trainingCentres.length} records.`);
  } catch (err) {
    console.error('Training centre seeding failed:', err.message);
  }
}
const sessions = new Map();

async function runSkillDemandRefresh() {
  try {
    const result = await refreshSkillDemand(SkillDemand);
    console.log(`Skill demand refreshed: ${result.results.length} skills from ${result.source_count} sources.`);
  } catch (err) {
    console.error('Skill demand refresh failed; previous data was retained:', err.message);
  }
}

function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = sessions.get(token);
  if (!userId) return res.status(401).json({ message: 'Please log in to continue.' });
  req.userId = userId;
  next();
}

/* ---------- Validation (mirrors the browser checks) ---------- */
const GMAIL = /^[a-z0-9._%+-]+@gmail\.com$/i;
const PHONE = /^\+?[0-9]{10,15}$/;

function validateRegistration(b) {
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const errors = {};

  if (s(b.name).length < 2) errors.name = 'Enter your full name.';
  if (s(b.fatherName).length < 2) errors.fatherName = "Enter your father's name.";
  if (!s(b.location)) errors.location = 'Enter your city or town.';
  if (!PHONE.test(s(b.phone).replace(/[\s-]/g, ''))) errors.phone = 'Enter a valid phone number.';
  if (!GMAIL.test(s(b.email))) errors.email = 'Enter a Gmail address ending in @gmail.com.';
  if (s(b.email).toLowerCase() !== s(b.confirmEmail).toLowerCase()) errors.confirmEmail = 'Gmail IDs do not match.';
  if (!s(b.profession)) errors.profession = 'Enter your profession or occupation.';

  const pw = typeof b.password === 'string' ? b.password : '';
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    errors.password = 'Use at least 8 characters with a letter and a number.';
  }
  if (pw !== b.confirmPassword) errors.confirmPassword = 'Passwords do not match.';

  return errors;
}

/* ---------- Routes ---------- */
app.post('/api/register', async (req, res) => {
  try {
    const errors = validateRegistration(req.body || {});
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Check the highlighted fields.', errors });

    const email = req.body.email.trim().toLowerCase();
    if (await User.findOne({ email })) {
      return res.status(409).json({
        message: 'This Gmail ID is already registered.',
        errors: { email: 'This Gmail ID is already registered. Log in instead.' }
      });
    }

    const hashed = await bcrypt.hash(req.body.password, 10);
    await User.create({
      name: req.body.name,
      fatherName: req.body.fatherName,
      location: req.body.location,
      phone: req.body.phone,
      email,
      profession: req.body.profession,
      password: hashed
    });

    res.status(201).json({ message: 'Account created.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Something went wrong on the server. Try again.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const user = email && password ? await User.findOne({ email }) : null;
    const ok = user ? await bcrypt.compare(password, user.password) : false;

    // Same message for both cases so nobody can probe which Gmail IDs exist.
    if (!ok) return res.status(401).json({ message: 'Incorrect Gmail ID or password.' });

    res.json({
      message: 'Logged in.',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        profession: user.profession,
        savedJobs: user.savedJobs || [],
        appliedJobs: user.appliedJobs || []
      },
      token: (() => {
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, user._id.toString());
        return token;
      })()
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Something went wrong on the server. Try again.' });
  }
});

app.post('/api/logout', authenticate, (req, res) => {
  const header = req.get('authorization') || '';
  sessions.delete(header.slice(7));
  res.json({ message: 'Logged out.' });
});

app.get('/api/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(401).json({ message: 'Account not found.' });
    res.json({ user });
  } catch (err) {
    console.error('Session lookup error:', err);
    res.status(500).json({ message: 'Could not load your account.' });
  }
});

app.get('/api/skill-demand', async (req, res) => {
  try {
    const skills = await SkillDemand.find().sort({ demand_count: -1, skill_name: 1 }).lean();
    const lastUpdated = skills.reduce((latest, item) => item.last_updated > latest ? item.last_updated : latest, new Date(0));
    res.json({ skills, last_updated: lastUpdated.getTime() ? lastUpdated : null });
  } catch (err) {
    console.error('Skill demand lookup error:', err);
    res.status(500).json({ message: 'Could not load current skill demand.' });
  }
});

app.post('/api/skill-demand/refresh', async (req, res) => {
  if (!process.env.DEMAND_REFRESH_TOKEN || req.get('x-demand-refresh-token') !== process.env.DEMAND_REFRESH_TOKEN) {
    return res.status(401).json({ message: 'A valid demand refresh token is required.' });
  }
  try {
    const result = await refreshSkillDemand(SkillDemand);
    res.json({ message: 'Skill demand refreshed.', source_count: result.source_count, skills: result.results });
  } catch (err) {
    console.error('Manual skill demand refresh failed; previous data was retained:', err.message);
    res.status(502).json({ message: err.message });
  }
});

app.get('/api/training-centres', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json({
      count: trainingCentres.length,
      centres: trainingCentres.map((centre, index) => ({ ...centre, _id: `source-${index + 1}` }))
    });
  }
  try {
    const filter = {};
    const escape = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (typeof req.query.course === 'string' && req.query.course.trim()) {
      filter.courses = { $regex: escape(req.query.course.trim()), $options: 'i' };
    }
    if (typeof req.query.area === 'string' && req.query.area.trim()) {
      filter.area = { $regex: escape(req.query.area.trim()), $options: 'i' };
    }
    const centres = await TrainingCentre.find(filter).sort({ name: 1 }).lean();
    res.json({ count: centres.length, centres });
  } catch (err) {
    console.error('Training centres lookup error:', err);
    res.status(500).json({ message: 'Could not load training centres.' });
  }
});

app.get('/api/training-centres/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid training centre.' });
  try {
    const centre = await TrainingCentre.findById(req.params.id).lean();
    if (!centre) return res.status(404).json({ message: 'Training centre not found.' });
    res.json({ centre });
  } catch (err) {
    console.error('Training centre lookup error:', err);
    res.status(500).json({ message: 'Could not load this training centre.' });
  }
});

app.get('/api/saved-jobs', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('savedJobs');
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    res.json({ savedJobs: user.savedJobs || [] });
  } catch (err) {
    console.error('Saved jobs lookup error:', err);
    res.status(500).json({ message: 'Could not load saved jobs.' });
  }
});

app.post('/api/jobs/:jobId/save', authenticate, async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId < 1) return res.status(400).json({ message: 'Invalid job.' });
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $addToSet: { savedJobs: jobId } },
      { new: true, projection: 'savedJobs' }
    );
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    res.json({ savedJobs: user.savedJobs });
  } catch (err) {
    console.error('Save job error:', err);
    res.status(500).json({ message: 'Could not save this job.' });
  }
});

app.delete('/api/jobs/:jobId/save', authenticate, async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId < 1) return res.status(400).json({ message: 'Invalid job.' });
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { $pull: { savedJobs: jobId } },
      { new: true, projection: 'savedJobs' }
    );
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    res.json({ savedJobs: user.savedJobs });
  } catch (err) {
    console.error('Remove saved job error:', err);
    res.status(500).json({ message: 'Could not remove this saved job.' });
  }
});

app.post('/api/jobs/:jobId/apply', authenticate, async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId < 1) return res.status(400).json({ message: 'Invalid job.' });
  try {
    const user = await User.findById(req.userId).select('appliedJobs');
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    if (!user.appliedJobs.some((job) => job.jobId === jobId)) {
      user.appliedJobs.push({ jobId, status: 'Applied' });
      await user.save();
    }
    res.json({ appliedJobs: user.appliedJobs });
  } catch (err) {
    console.error('Apply job error:', err);
    res.status(500).json({ message: 'Could not submit your application.' });
  }
});

app.get('/', (req, res) => res.redirect('/register.html'));

// Catch-all: anything else that goes wrong in a route or middleware
// and would otherwise crash the request silently.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'Something went wrong on the server. Try again.' });
});

// If the process itself throws outside of a request (a bug in some
// background code, a bad Promise, etc.), log it instead of letting the
// whole server die silently and take every open connection down with it.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept running):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (server kept running):', err);
});

/* ---------- Start ---------- */
app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    seedTrainingCentres();
    if (process.env.RUN_DEMAND_REFRESH_ON_START === 'true') runSkillDemandRefresh();
    setInterval(runSkillDemandRefresh, 24 * 60 * 60 * 1000);
  })
  .catch((err) => console.error('MongoDB connection failed:', err.message));
