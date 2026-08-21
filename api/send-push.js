/* Funzione Vercel: unico posto dove vive la chiave privata VAPID.
   Riceve { nicks, title, body, url }, cerca su Supabase chi fra quei nick ha
   attivato le notifiche, e manda a ciascuno l'avviso. Le sottoscrizioni morte
   (chi ha disinstallato o revocato il permesso) vengono cancellate al volo. */
const webpush = require("web-push");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

webpush.setVapidDetails(
  "mailto:gabbia-padel@example.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sb(path, opts) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, Object.assign({
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(opts && opts.headers)
    }
  }, opts));
  if (!res.ok) throw new Error("supabase " + res.status + " " + await res.text());
  return res.status === 204 ? null : res.json();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({error:"solo POST"}); return; }
  try {
    const { nicks, title, body, url } = req.body || {};
    if (!Array.isArray(nicks) || !nicks.length) {
      res.status(400).json({error:"serve un elenco di nick"}); return;
    }
    const inList = "(" + nicks.map(n => '"' + String(n).replace(/"/g,'') + '"').join(",") + ")";
    const players = await sb("players?select=id,nick&nick=in." + encodeURIComponent(inList));
    if (!players.length) { res.status(200).json({sent:0,failed:0,nota:"nessun giocatore trovato"}); return; }
    const ids = players.map(p => p.id);
    const idList = "(" + ids.join(",") + ")";
    const subs = await sb("push_subscriptions?select=id,endpoint,p256dh,auth&player_id=in." + encodeURIComponent(idList));

    const payload = JSON.stringify({ title, body, url });
    let sent = 0, failed = 0, rimosse = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (err) {
        failed++;
        /* 404/410 = il browser ha revocato l'iscrizione: non serve più, si toglie */
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          try { await sb("push_subscriptions?id=eq." + s.id, { method: "DELETE" }); rimosse++; } catch (e) {}
        }
      }
    }));
    res.status(200).json({ sent, failed, rimosse, destinatari: players.map(p=>p.nick) });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
