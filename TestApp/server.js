const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());
app.use(express.raw());

// Log all incoming requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    next();
});

// Echo endpoint for automated testing
app.all('/api/echo', (req, res) => {
    res.status(200).json({
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query,
        cookies: req.headers.cookie || ''
    });
});

// GET endpoint
app.get('/api/test', (req, res) => {
    console.log('Query params:', req.query);
    res.status(200).send('ok process');
});

app.get('/api/test/:id', (req, res) => {
    console.log('Path param id:', req.params.id);
    console.log('Query params:', req.query);
    res.status(200).send('ok process');
});

// POST endpoints
app.post('/api/test', (req, res) => {
    console.log('Body:', req.body);
    res.status(201).send('ok process');
});

app.post('/api/test/:id', (req, res) => {
    console.log('Path param id:', req.params.id);
    console.log('Body:', req.body);
    res.status(201).send('ok process');
});

// POST multipart/form-data (single file)
app.post('/api/upload/single', upload.single('file'), (req, res) => {
    console.log('Body fields:', req.body);
    if (req.file) {
        console.log('Uploaded file:', req.file.originalname, 'size:', req.file.size);
    } else {
        console.log('No file received');
    }
    res.status(201).send('ok process');
});

// POST multipart/form-data (multiple files)
app.post('/api/upload/multiple', upload.any(), (req, res) => {
    console.log('Body fields:', req.body);
    const files = req.files || [];
    if (files.length > 0) {
        files.forEach(f => console.log('Uploaded file:', f.originalname, 'fieldname:', f.fieldname, 'size:', f.size));
    } else {
        console.log('No files received');
    }
    res.status(201).send('ok process');
});

// POST multipart/form-data (mixed fields and files)
app.post('/api/upload/mixed', upload.any(), (req, res) => {
    console.log('Body fields:', req.body);
    if (req.files && req.files.length > 0) {
        req.files.forEach(f => console.log('Uploaded file:', f.originalname, 'fieldname:', f.fieldname, 'size:', f.size));
    } else {
        console.log('No files received');
    }
    res.status(201).send('ok process');
});

// PUT endpoints
app.put('/api/test', (req, res) => {
    console.log('Body:', req.body);
    res.status(200).send('ok process');
});

app.put('/api/test/:id', (req, res) => {
    console.log('Path param id:', req.params.id);
    console.log('Body:', req.body);
    res.status(200).send('ok process');
});

// DELETE endpoints
app.delete('/api/test', (req, res) => {
    console.log('Body:', req.body);
    res.status(200).send('ok process');
});

app.delete('/api/test/:id', (req, res) => {
    console.log('Path param id:', req.params.id);
    console.log('Body:', req.body);
    res.status(200).send('ok process');
});

// PATCH endpoints
app.patch('/api/test', (req, res) => {
    console.log('Body:', req.body);
    res.status(200).send('ok process');
});

app.patch('/api/test/:id', (req, res) => {
    console.log('Path param id:', req.params.id);
    console.log('Body:', req.body);
    res.status(200).send('ok process');
});

// HEAD endpoint
app.head('/api/test', (req, res) => {
    res.status(200).end();
});

// OPTIONS endpoint
app.options('/api/test', (req, res) => {
    res.status(204).end();
});

// Raw body catch-all for any content-type
app.use((req, res, next) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
            if (data) {
                req.body = data;
                console.log('Raw body:', data);
            }
            next();
        });
    } else {
        next();
    }
});

const PORT = 3456;
const server = app.listen(PORT, () => {
    console.log(`TestApp server running at http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET    /api/test');
    console.log('  GET    /api/test/:id');
    console.log('  POST   /api/test');
    console.log('  POST   /api/test/:id');
    console.log('  POST   /api/upload/single   (multipart, field: file)');
    console.log('  POST   /api/upload/multiple (multipart, field: files)');
    console.log('  POST   /api/upload/mixed    (multipart, any fields)');
    console.log('  PUT    /api/test');
    console.log('  PUT    /api/test/:id');
    console.log('  DELETE /api/test');
    console.log('  DELETE /api/test/:id');
    console.log('  PATCH  /api/test');
    console.log('  PATCH  /api/test/:id');
    console.log('  HEAD   /api/test');
    console.log('  OPTIONS /api/test');
});

module.exports = server;
