import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';

// Importing the modules from TYREX_KSH MD folder
import pairRouter from './TYREX_KSH_MD/pair.js';
import qrRouter from './TYREX_KSH_MD/qr.js';

const app = express();

// Resolve the current directory path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;

import('events').then(events => {
    events.EventEmitter.defaultMaxListeners = 500;
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/TYREX_KSH_MD', express.static(path.join(__dirname, 'TYREX_KSH_MD')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'TYREX_KSH_MD', 'pair.html'));
});

app.use('/pair', pairRouter);
app.use('/qr', qrRouter);

app.listen(PORT, () => {
    console.log(`🤖 TYREX_KSH MD\n👨‍💻 Owner: TYREX_KSH\n\n✅ Server running on http://localhost:${PORT}`);
});

export default app;
