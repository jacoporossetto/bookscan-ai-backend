import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config'; // Mantiene la compatibilità per quando lo esegui in locale

const app = express();
app.use(cors());
app.use(express.json());

// --- MODIFICA CHIAVE QUI ---
// Invece di importare da un file, leggiamo la chiave API direttamente 
// dalla variabile d'ambiente impostata su Render (o dal file .env in locale).
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/rate-book', async (req, res) => {
  const { book, userPreferences, readingHistory } = req.body;

  if (!book || !userPreferences) {
    return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
  }

  // Costruisci il prompt come prima
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `
    Sei un critico letterario e un book advisor estremamente perspicace, specializzato nel calcolare l'affinità tra un lettore e un libro.
    
    ANALISI DEL LETTORE:
    - Generi Preferiti: ${userPreferences.favoriteGenres?.join(', ') || 'Non specificati'}
    - Bio Letteraria: ${userPreferences.bio || 'Non specificata'}
    - Vibes Ricercate: ${userPreferences.vibes?.join(', ') || 'Non specificate'}
    - Ritmo Preferito: ${userPreferences.readingPace || 'Non specificato'}
    - Cronologia Recente (libri già letti e valutati dal lettore da 1 a 5): ${JSON.stringify(readingHistory) || 'Nessuna'}

    ANALISI DEL LIBRO TARGET:
    - Titolo: ${book.title}
    - Autori: ${book.authors?.join(', ')}
    - Descrizione: ${book.description}
    - Categorie: ${book.categories?.join(', ')}

    IL TUO COMPITO:
    Basandoti esclusivamente sulle informazioni fornite, calcola un punteggio di affinità da 1.0 a 5.0 tra il lettore e il libro target. Fornisci la tua analisi ESCLUSIVAMENTE in formato JSON, senza testo prima o dopo.

    Il JSON deve avere questa struttura:
    {
      "rating": number,
      "short_reasoning": "stringa singola di massimo 15 parole che riassume il tuo giudizio",
      "positive_points": ["array di 2 o 3 stringhe che elencano i motivi per cui potrebbe piacere"],
      "negative_points": ["array di 1 o 2 stringhe che elencano i potenziali punti deboli o di non gradimento per questo specifico lettore"]
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Estrai il blocco JSON dalla risposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('La risposta dell\'IA non è in formato JSON valido.');
    }
    const jsonData = JSON.parse(jsonMatch[0]);
    res.json(jsonData);

  } catch (error) {
    console.error('Errore durante la chiamata all\'IA:', error);
    res.status(500).json({ error: "Impossibile contattare il servizio di analisi AI." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
