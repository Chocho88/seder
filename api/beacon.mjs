// POST /api/beacon - the app's diagnostic heartbeat. When sync fails (or
// recovers) in production, the client sends its build stamp, the error text
// and the pending count here; the function logs it to the deployment's
// runtime logs, where it can be read remotely. No task content is ever
// sent - only sync state. This exists so "it still shows an error" can be
// debugged by reading logs instead of asking a human to copy red text.

export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const line = {
      t: new Date().toISOString(),
      build: String(body.build ?? '?').slice(0, 40),
      uid: String(body.uid ?? '?').slice(0, 8),
      pending: Number(body.pending ?? -1),
      sharingReady: body.sharingReady,
      error: body.error == null ? null : String(body.error).slice(0, 400),
      ua: String(req.headers['user-agent'] ?? '').slice(0, 80),
    };
    console.log('[seder-beacon]', JSON.stringify(line));
  } catch (e) {
    console.log('[seder-beacon] unparseable', String(e).slice(0, 100));
  }
  res.status(204).end();
}
