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

    if (!data || data.total_count === 0 || !data.data || data.data.length === 0) {
      return res.status(404).json({
        eligible: false,
        reason: 'Aucun contact trouvé avec cet email'
      });
    }

    // 🔍 Ne garder que les contacts avec le rôle "user"
    const contact = data.data
      .filter(c => c.role === 'user')
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))[0];

    if (!contact) {
      return res.status(404).json({
        eligible: false,
        reason: "Aucun 'user' trouvé pour cet email"
      });
    }

    // 🧠 Lecture du champ personnalisé
    const timestamp = contact.custom_attributes?.inscription_date;

    if (!timestamp) {
      return res.status(200).json({
        eligible: false,
        reason: "Champ 'inscription_date' non défini pour ce contact",
        debug: {
          contact_id: contact.id,
          custom_attributes: contact.custom_attributes,
          keys: Object.keys(contact.custom_attributes || {})
        }
      });
    }

    const createdAt = new Date(timestamp * 1000);
    const now = new Date();
    const daysSinceSignup = (now - createdAt) / (1000 * 60 * 60 * 24);
    const eligible = daysSinceSignup <= 30;

    return res.status(200).json({
      eligible,
      reason: eligible
        ? "Utilisateur inscrit depuis moins de 30 jours"
        : "Utilisateur inscrit depuis plus de 30 jours",
      debug: {
        contact_id: contact.id,
        name: contact.name || null,
        email: contact.email || email,
        inscriptionDate: createdAt.toISOString(),
        daysSinceSignup: Math.floor(daysSinceSignup)
      }
    });

  } catch (error) {
    console.error('Erreur Intercom API:', error);
    return res.status(500).json({
      error: 'Erreur interne',
      details: error.message
    });
  }
};

