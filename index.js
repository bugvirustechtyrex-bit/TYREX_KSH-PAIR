import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';

// Importing the modules from tyrexksh folder
import pairRouter from './tyrexksh/pair.js';
import qrRouter from './tyrexksh/qr.js';

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
app.use('/tyrexksh', express.static(path.join(__dirname, 'tyrexksh')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'tyrexksh', 'pair.html'));
});

app.use('/pair', pairRouter);
app.use('/qr', qrRouter);

app.listen(PORT, () => {
    console.log(`🤖 TYREX_KSH MD Bot\n👨‍💻 Owner: TYREX_KSH\n\n✅ Server running on http://localhost:${PORT}`);
});

export default app;
