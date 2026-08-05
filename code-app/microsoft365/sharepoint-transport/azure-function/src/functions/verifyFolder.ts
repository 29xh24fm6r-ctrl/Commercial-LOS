import { app } from '@azure/functions';
import { invoke } from './common.js';
app.http('verifyFolder', { methods: ['POST'], authLevel: 'function', route: 'sharepoint/verifyFolder', handler: (request, context) => invoke('verifyFolder', request, context) });
