(() => {
  const MAX_SINGLE_REQUEST_BYTES = 16 * 1024 * 1024;

  function csrfToken() {
    return new Promise((resolve, reject) => {
      if (!window.shell || typeof window.shell.getTokenDeferred !== 'function') {
        reject(new Error('The secure request token is unavailable. Refresh and sign in again.'));
        return;
      }
      window.shell.getTokenDeferred().done(resolve).fail(reject);
    });
  }

  async function portalRequest(url, options) {
    const token = await csrfToken();
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        __RequestVerificationToken: token,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Secure portal request returned ${response.status}.`);
    }
    return response;
  }

  async function upload(form) {
    const input = form.querySelector('input[type="file"]');
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('[role="status"]');
    const documentId = form.dataset.documentId;
    const file = input && input.files && input.files[0];
    if (!file || !documentId) return;

    if (file.size > MAX_SINGLE_REQUEST_BYTES) {
      status.textContent =
        'This portal accepts files up to 16 MB per upload. Contact your banker for a larger file.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Uploading securely…';
    try {
      await portalRequest(
        `/_api/cr664_documentchecklists(${encodeURIComponent(documentId)})/cr664_documentfile`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-ms-file-name': encodeURIComponent(file.name),
          },
          body: await file.arrayBuffer(),
        },
      );

      try {
        await portalRequest(
          `/_api/cr664_documentchecklists(${encodeURIComponent(documentId)})`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cr664_originalfilename: file.name,
              cr664_mimetype: file.type || 'application/octet-stream',
              cr664_filesizebytes: file.size,
              cr664_uploadedon: new Date().toISOString(),
              cr664_receiveddate: new Date().toISOString(),
              cr664_uploadstatus: true,
            }),
          },
        );
        status.textContent = 'Upload complete. The requested document is now marked received.';
        form.querySelector('input').disabled = true;
      } catch {
        status.textContent =
          'The file was saved, but its received status could not be updated. Your banker has been asked to review it.';
      }
    } catch {
      status.textContent =
        'The upload did not complete. No received status was recorded. Please retry or contact your banker.';
      button.disabled = false;
      return;
    }
    button.disabled = true;
  }

  document.querySelectorAll('[data-borrower-upload]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      upload(form);
    });
  });
})();
