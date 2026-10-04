require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const { v2: cloudinary } = require('cloudinary');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD_SIZE = Number(process.env.MAX_UPLOAD_SIZE_BYTES) || 15 * 1024 * 1024;
const DEFAULT_PASSWORDS = Object.freeze({ open: 'aliemad', edit: 'aliemad70' });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return callback(new Error('invalid_file_type'));
    }
    callback(null, true);
  }
});

const defaultContent = {
  recipient: 'her', himName: 'عمر', herName: 'سارة',
  envelopeTopText: 'A letter for', envelopeName: 'سارة', envelopeEmoji: '❤',
  letterEmojis: ['😍', '🥹'],
  letterPages: ['رسالة صغيرة من القلب ❤', 'اكتب كلامك هنا...'],
  heroTitle: 'Our Story', heroSubtitle: 'المكان الصغير اللي بيجمع حكايتنا ❤',
  counterCaption: 'كل ثانية بتعدي وانت في قلبي ❤', giftBoxTitle: 'مفاجأة صغيرة',
  startDate: '2023-01-01T00:00', songTitle: '', songClip: '', songUrl: '', songAutoplay: false,
  messagesRequireEditPassword: true,
  timeline: [], messages: [], memories: [], giftBox: { caption: '', src: '' }
};

const contentSchema = new mongoose.Schema({
  recipient: String, himName: String, herName: String,
  envelopeTopText: String, envelopeName: String, envelopeEmoji: String,
  letterEmojis: [String], letterPages: [String],
  heroTitle: String, heroSubtitle: String, counterCaption: String, giftBoxTitle: String,
  startDate: String, songTitle: String, songClip: String, songUrl: String, songAutoplay: Boolean,
  messagesRequireEditPassword: Boolean,
  timeline: { type: [mongoose.Schema.Types.Mixed], default: [] },
  messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
  memories: { type: [mongoose.Schema.Types.Mixed], default: [] },
  giftBox: { type: mongoose.Schema.Types.Mixed, default: () => ({ caption: '', src: '' }) }
}, { _id: false, strict: false, minimize: false });

const storySchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  content: { type: contentSchema, default: () => ({ ...defaultContent }) },
  passwords: {
    open: { type: String, default: DEFAULT_PASSWORDS.open },
    edit: { type: String, default: DEFAULT_PASSWORDS.edit }
  },
  revision: { type: Number, default: 1 }
}, { timestamps: true, minimize: false });

const Story = mongoose.model('Story', storySchema);

function safeSlug(value) {
  return String(value || '').trim();
}

async function getStory(slug) {
  const key = safeSlug(slug);
  if (!key) throw new Error('invalid_slug');
  return Story.findOneAndUpdate(
    { slug: key },
    { $setOnInsert: { slug: key, content: { ...defaultContent }, passwords: { ...DEFAULT_PASSWORDS }, revision: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function publicContent(story) {
  return story.content || { ...defaultContent };
}

app.get('/api/story/:slug/meta', async (req, res, next) => {
  try {
    const content = publicContent(await getStory(req.params.slug));
    res.json({
      recipient: content.recipient, recipientName: content.herName,
      envelopeTopText: content.envelopeTopText, envelopeName: content.envelopeName,
      envelopeEmoji: content.envelopeEmoji, letterPages: content.letterPages,
      editButtonPlacement: 'bottom'
    });
  } catch (error) { next(error); }
});

app.post('/api/story/:slug/open', async (req, res, next) => {
  try {
    const story = await getStory(req.params.slug);
    if (req.body.password !== story.passwords.open) return res.status(401).json({ error: 'wrong_password' });
    res.json({ content: publicContent(story), brandName: 'Agency', whatsapp: '#' });
  } catch (error) { next(error); }
});

app.post('/api/gifts/:slug/login', async (req, res, next) => {
  try {
    const story = await getStory(req.params.slug);
    if (req.body.password !== story.passwords.edit) return res.status(401).json({ error: 'wrong_password' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/story/:slug/content', async (req, res, next) => {
  try {
    const story = await getStory(req.params.slug);
    res.json({ content: publicContent(story), revision: story.revision });
  } catch (error) { next(error); }
});

app.post('/api/story/:slug/content', async (req, res, next) => {
  try {
    const key = safeSlug(req.params.slug);
    await getStory(key);
    const updates = req.body && req.body.content;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ error: 'invalid_content' });
    }
    const set = {};
    for (const [field, value] of Object.entries(updates)) {
      if (field !== '__proto__' && field !== 'passwords' && field !== 'slug' && field !== 'revision') {
        set[`content.${field}`] = value;
      }
    }
    const story = await Story.findOneAndUpdate(
      { slug: key },
      { $set: set, $inc: { revision: 1 } },
      { new: true, runValidators: true }
    );
    res.json({ ok: true, content: publicContent(story), revision: story.revision });
  } catch (error) { next(error); }
});

app.get('/api/story/:slug/open-password', async (req, res, next) => {
  try { res.json({ password: (await getStory(req.params.slug)).passwords.open }); }
  catch (error) { next(error); }
});

app.post('/api/story/:slug/open-password', async (req, res, next) => {
  try {
    const password = req.body?.password;
    if (typeof password !== 'string' || !password.trim()) return res.status(400).json({ error: 'invalid_password' });
    const story = await getStory(req.params.slug);
    const updatedStory = await Story.findOneAndUpdate(
      { _id: story._id },
      { $set: { 'passwords.open': password.trim() } },
      { new: true, runValidators: true }
    );
    if (!updatedStory) return res.status(404).json({ error: 'story_not_found' });
    res.json({ password: updatedStory.get('passwords.open') });
  } catch (error) { next(error); }
});

app.get('/api/gifts/:slug/admin/password', async (req, res, next) => {
  try { res.json({ password: (await getStory(req.params.slug)).passwords.edit }); }
  catch (error) { next(error); }
});

app.post('/api/gifts/:slug/admin/password', async (req, res, next) => {
  try {
    const password = req.body?.password;
    if (typeof password !== 'string' || password.trim().length < 6) return res.status(400).json({ error: 'invalid_password' });
    const story = await getStory(req.params.slug);
    const updatedStory = await Story.findOneAndUpdate(
      { _id: story._id },
      { $set: { 'passwords.edit': password.trim() } },
      { new: true, runValidators: true }
    );
    if (!updatedStory) return res.status(404).json({ error: 'story_not_found' });
    res.json({ password: updatedStory.get('passwords.edit') });
  } catch (error) { next(error); }
});

app.post('/api/story/:slug/messages', async (req, res, next) => {
  try {
    const story = await getStory(req.params.slug);
    const content = publicContent(story);
    const messages = Array.isArray(content.messages) ? content.messages : [];
    const newMessage = { id: Date.now(), text: req.body.text, from: req.body.from };
    const updatedMessages = [...messages, newMessage];
    const updated = await Story.findOneAndUpdate(
      { slug: story.slug },
      { $set: { 'content.messages': updatedMessages }, $inc: { revision: 1 } },
      { new: true }
    );
    res.json({ ok: true, messages: updated.content.messages });
  } catch (error) { next(error); }
});

app.put('/api/story/:slug/messages/:id', async (req, res, next) => {
  try {
    const story = await getStory(req.params.slug);
    const messages = [...(publicContent(story).messages || [])];
    const message = messages.find(item => String(item.id) === req.params.id);
    if (message) message.text = req.body.text;
    const updated = await Story.findOneAndUpdate(
      { slug: story.slug },
      { $set: { 'content.messages': messages }, $inc: { revision: 1 } },
      { new: true }
    );
    res.json({ ok: true, messages: updated.content.messages });
  } catch (error) { next(error); }
});

app.delete('/api/story/:slug/messages/:id', async (req, res, next) => {
  try {
    const story = await getStory(req.params.slug);
    const messages = (publicContent(story).messages || []).filter(item => String(item.id) !== req.params.id);
    const updated = await Story.findOneAndUpdate(
      { slug: story.slug },
      { $set: { 'content.messages': messages }, $inc: { revision: 1 } },
      { new: true }
    );
    res.json({ ok: true, messages: updated.content.messages });
  } catch (error) { next(error); }
});

app.post('/api/gifts/:slug/admin/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: `uploads/${safeSlug(req.params.slug)}`,
        resource_type: 'image'
      }, (error, uploaded) => error ? reject(error) : resolve(uploaded));
      stream.end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (error) { next(error); }
});

app.get('/gift/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'upload_file_too_large' });
  }
  if (error.message === 'invalid_file_type') return res.status(400).json({ error: 'invalid_file_type' });
  console.error(error);
  res.status(500).json({ error: 'server_error' });
});

async function start() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

start().catch(error => {
  console.error('Server startup failed:', error.message);
  process.exit(1);
});
