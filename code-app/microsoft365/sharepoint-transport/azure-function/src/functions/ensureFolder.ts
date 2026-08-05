import { app } from '@azure/functions';
import { invoke } from './common.js';
app.http('ensureFolder', { methods: ['POST'], authLevel: 'function', route: 'sharepoint/ensureFolder', handler: (request, context) => invoke('ensureFolder', request, context) });
