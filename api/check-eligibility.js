export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { email, visitorId } = req.query;
  let finalEmail = email;
  let debugInfo = {};

  // Si pas d'email → essayer via visitorId (Intercom ID direct)
  if (!finalEmail && visitorId) {
    try {
      const response = await fetch("https://api.intercom.io/contacts/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: {
            operator: "AND",
            value: [
              { field: "id", operator: "=", value: visitorId },
              { field: "role", operator: "=", value: "user" }
            ]
          }
        })
      });

      const data = await response.json();
      if (data?.data?.length > 0) {
        finalEmail = data.data[0].email;
        debugInfo = {
          contact_id: data.data[0].id,
          email: finalEmail
        };
      }
    } catch (error) {
      console.error("❌ Erreur récupération via Intercom ID :", error);
    }
  }

  if (!finalEmail) {
    return res.status(400).json({
      eligible: false,
      reason: "Email introuvable",
      debug: debugInfo
    });
  }

  try {
    // Recherche par email dans Intercom
    const searchResponse = await fetch("https://api.intercom.io/contacts/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.INTERCOM_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: {
          operator: "AND",
          value: [
            { field: "email", operator: "=", value: finalEmail },
            { field: "role", operator: "=", value: "user" }
          ]
        }
      })
    });

    const data = await searchResponse.json();

    if (!data || !data.data || data.data.length === 0) {
      return res.status(404).json({
        eligible: false,
        reason: "Utilisateur non trouvé",
        debug: { email: finalEmail }
      });
    }

    const contact = data.data[0];
    const timestamp = contact.signed_up_at;

    if (!timestamp) {
      return res.status(200).json({
        eligible: false,
        reason: "Date d'inscription non définie",
        debug: { contact_id: contact.id, email: finalEmail }
      });
    }

    const createdAt = new Date(timestamp * 1000);
    const now = new Date();
    const daysSinceSignup = (now - createdAt) / (1000 * 60 * 60 * 24);
    const eligible = daysSinceSignup <= 60;

    return res.status(200).json({
      eligible,
      reason: eligible ? "Inscrit depuis moins de 60 jours" : "Inscrit depuis plus de 60 jours",
      debug: {
        email: finalEmail,
        contact_id: contact.id,
        signedUpAt: createdAt.toISOString(),
        daysSinceSignup: Math.floor(daysSinceSignup)
      }
    });

  } catch (error) {
    console.error("❌ Erreur API Intercom :", error);
    return res.status(500).json({
      error: "Erreur serveur",
      details: error.message
    });
  }
}
