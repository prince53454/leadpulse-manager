import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.resolve(__dirname, '../public')));
const port = Number(process.env.PORT || 3000);
app.listen(port, ()=>console.log(`LeadPulse listening on http://localhost:${port}`));
