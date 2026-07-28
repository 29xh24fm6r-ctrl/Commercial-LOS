import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PORTAL_ROOT = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'power-pages',
  'commercial-los-borrower-portal---commercial-los-borrower-prod',
);

function read(relativePath: string): string {
  return readFileSync(resolve(PORTAL_ROOT, relativePath), 'utf8');
}

describe('borrower portal live binary-upload wiring', () => {
  const settings = read('sitesetting.yml');
  const html = read(
    'web-pages/home/content-pages/Home.en-US.webpage.copy.html',
  );
  const javascript = read(
    'web-pages/home/content-pages/Home.en-US.webpage.custom_javascript.js',
  );

  it('enables only the document-checklist Web API fields required by upload', () => {
    expect(settings).toMatch(/Webapi\/cr664_documentchecklist\/enabled[\s\S]*true/);
    expect(settings).toMatch(
      /Webapi\/cr664_documentchecklist\/fields[\s\S]*cr664_documentfile/,
    );
    expect(settings).toMatch(/Authentication\/Registration\/OpenRegistrationEnabled[\s\S]*false/);
  });

  it('renders upload controls only inside the contact-scoped requested-document result', () => {
    expect(html).toMatch(
      /condition attribute="cr664_portalcontact" operator="eq" value="{{ user\.id }}"/,
    );
    expect(html).toMatch(/{% unless document\.cr664_uploadstatus %}/);
    expect(html).toMatch(/data-borrower-upload/);
  });

  it('uses the authenticated Power Pages anti-forgery token and File-column endpoint', () => {
    expect(javascript).toMatch(/shell\.getTokenDeferred/);
    expect(javascript).toMatch(/__RequestVerificationToken/);
    expect(javascript).toMatch(
      /_api\/cr664_documentchecklists\(\$\{encodeURIComponent\(documentId\)\}\)\/cr664_documentfile\?x-ms-file-name=\$\{encodeURIComponent\(file\.name\)\}/,
    );
    expect(javascript).toMatch(/method:\s*'PATCH'/);
    expect(javascript).not.toMatch(/'x-ms-file-name':\s*encodeURIComponent/);
    expect(javascript).toMatch(/16 \* 1024 \* 1024/);
  });

  it('never marks a failed binary upload as received', () => {
    const binaryWrite = javascript.indexOf('/cr664_documentfile');
    const metadataWrite = javascript.indexOf("method: 'PATCH'");
    expect(binaryWrite).toBeGreaterThan(-1);
    expect(metadataWrite).toBeGreaterThan(binaryWrite);
    expect(javascript).toMatch(
      /The upload did not complete\. No received status was recorded\./,
    );
  });
});
