import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist));
app.get('*', (_req,res)=>res.sendFile(path.join(dist,'index.html')));
const port = Number(process.env.PORT || 3000);
app.listen(port, ()=>console.log(`LeadPulse API listening on http://localhost:${port}`));
