// File: /server.js
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './config.js';

const { GEMINI_API_KEY } = config;

if (!GEMINI_API_KEY || GEMINI_API_KEY === "INCOLLA_LA_TUA_CHIAVE_API_DI_GEMINI_QUI") {
  console.error("\n❌ ERRORE: Chiave API di Gemini non trovata in 'config.js'.\n");
  process.exit(1);
}

const app = express();
const port = 3001;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

app.use(cors());
app.use(express.json({ limit: '1mb' })); // Aumentiamo il limite per la cronologia

app.post('/api/rate-book', async (req, res) => {
  console.log("Richiesta di analisi avanzata con cronologia ricevuta...");

  try {
    // --- MODIFICA CHIAVE: Ora riceviamo anche la cronologia di lettura ---
    const { book, userPreferences, readingHistory } = req.body;
    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati mancanti.' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    
    // --- PROMPT POTENZIATO CHE INCLUDE LA CRONOLOGIA ---
    const prompt = `
      Sei un critico letterario e un consulente di lettura d'élite, con una profonda comprensione dei gusti umani. Il tuo compito è analizzare un lettore, la sua cronologia di letture, e un nuovo libro per predire l'affinità.

      **Step 1: Analisi del DNA Letterario del Lettore (Profilo Statico).**
      Questi sono i gusti dichiarati dal lettore:
      - GENERI PREFERITI: ${userPreferences.favoriteGenres?.join(', ') || 'N/D'}
      - AUTORI PREFERITI: ${userPreferences.favoriteAuthors?.join(', ') || 'N/D'}
      - LIBRI DEL CUORE: ${userPreferences.favoriteBooks?.join(', ') || 'N/D'}
      - VIBES RICERCATE: ${userPreferences.vibes?.join(', ') || 'N/D'}

      **Step 2: Analisi della Cronologia di Lettura (Dati Comportamentali - FONDAMENTALI).**
      Questi sono i libri che il lettore ha già letto e valutato. Questa è la prova più importante dei suoi veri gusti.
      ${readingHistory && readingHistory.length > 0 ? readingHistory.map(b => `- "${b.title}": ${b.userRating}/5 stelle.`).join('\n') : 'Nessuna cronologia di lettura disponibile.'}
      
      **Step 3: Analisi del Libro Target.**
      - TITOLO: ${book.title}
      - AUTORE/I: ${book.authors?.join(', ')}
      - DESCRIZIONE: ${book.description?.substring(0, 500)}...

      **Step 4: Ragionamento Deduttivo e Produzione dell'Output.**
      Confronta l'analisi del libro target con il profilo del lettore, dando maggior peso alla cronologia di lettura. Se ha dato voti bassi a libri simili, sii cauto. Se ha amato libri con temi o stili simili, sii ottimista.
      Genera ESCLUSIVAMENTE un oggetto JSON valido con questa struttura:
      {
        "rating": <numero da 1 a 5, con un decimale>,
        "short_reasoning": "<frase concisa che riassume il tuo verdetto>",
        "positive_points": ["<primo punto a favore basato sulla cronologia>", "<secondo punto a favore>"],
        "negative_points": ["<primo punto di attenzione basato sulla cronologia>", "<eventuale secondo punto>"]
      }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("La risposta dell'IA non conteneva un JSON. Risposta: " + text);
    
    const jsonResponse = JSON.parse(jsonMatch[0]);
    console.log(`✅ Analisi con cronologia per "${book.title}" completata.`);
    return res.status(200).json(jsonResponse);

  } catch (error) {
    console.error('❌ Errore durante l\'analisi con cronologia:', error.message);
    res.status(500).json({ error: 'Errore interno del server.' });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
