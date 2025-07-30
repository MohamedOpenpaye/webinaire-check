module.exports = async function handler(req, res) {
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

    if (!data || data.total_count === 0 || !data.data || !data.data[0]) {
      return res.status(404).json({ eligible: false, reason: 'Email non trouvé' });
    }

    const contact = data.data[0];
    const timestamp = contact.custom_attributes?.inscription_date;

    // cas 1 : champ manquant
    if (!timestamp) {
      return res.status(200).json({
        eligible: false,
        reason: "Champ 'inscription_date' manquant",
        debug: {
          custom_attributes: contact.custom_attributes,
          keys: Object.keys(contact.custom_attributes || {})
        }
      });
    }

    // cas 2 : champ présent → calcul des jours
    const createdAt = new Date(timestamp * 1000);
    const now = new Date();
    const daysSinceSignup = (now - createdAt) / (1000 * 60 * 60 * 24);
    const eligible = daysSinceSignup <= 30;

    return res.status(200).json({
      eligible,
      reason: eligible ? "Inscrit depuis moins de 30 jours" : "Utilisateur trop ancien",
      debug: {
        inscriptionDate: createdAt.toISOString(),
        daysSinceSignup: Math.floor(daysSinceSignup),
        name: contact.name || null
      }
    });

  } catch (error) {
    console.error('Erreur Intercom API:', error);
    return res.status(500).json({ error: 'Erreur interne', details: error.message });
  }
};
