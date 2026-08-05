import { app } from '@azure/functions';
import { invoke } from './common.js';
app.http('upload', { methods: ['POST'], authLevel: 'function', route: 'sharepoint/upload', handler: (request, context) => invoke('upload', request, context) });
