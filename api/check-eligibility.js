// 📁 /api/check-eligibility.js

export default async function handler(req, res) {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email requis' });
  }

  try {
    const response = await fetch(`https://api.intercom.io/contacts?email=${encodeURIComponent(email)}`, {
      headers: {
        'Authorization': `Bearer ${process.env.INTERCOM_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();

    if (data.total_count === 0 || !data.data[0]) {
      return res.status(404).json({ eligible: false, reason: 'Email non trouvé' });
    }

    const contact = data.data[0];
    const signedUpAt = contact.signed_up_at || contact.created_at; // fallback

    if (!signedUpAt) {
      return res.status(500).json({ error: 'Impossible de déterminer la date d'inscription' });
    }

    const createdAt = new Date(signedUpAt * 1000);
    const now = new Date();
    const daysSinceSignup = (now - createdAt) / (1000 * 60 * 60 * 24);

    const eligible = daysSinceSignup <= 30;

    return res.status(200).json({ eligible });

  } catch (error) {
    console.error('Erreur Intercom API:', error);
    return res.status(500).json({ error: 'Erreur Interne' });
  }
}
