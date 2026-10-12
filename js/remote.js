// Client for the Google Apps Script backend (backend/Code.gs). The backend keeps one JSON file in the owner's Google Drive.
// POST with a text/plain body avoids a CORS preflight, which Apps Script web apps cannot answer.

export async function call(url, key, action, payload = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, key, ...payload }),
    });
  } catch (e) {
    throw new Error('Could not reach the backend. Check the internet connection and the backend URL.');
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error('The backend did not return data. Re-deploy the Apps Script as a web app that anyone can open, then paste the new /exec URL.');
  }
  if (json.error) throw new Error(json.error);
  return json;
}
