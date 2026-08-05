import { app } from '@azure/functions';
import { invoke } from './common.js';
app.http('verifyFile', { methods: ['POST'], authLevel: 'function', route: 'sharepoint/verifyFile', handler: (request, context) => invoke('verifyFile', request, context) });
