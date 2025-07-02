import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Funzione di pulizia della descrizione
const sanitizeDescription = (description) => {
  if (!description) return ''; // Restituisce una stringa vuota se non c'è descrizione
  const withoutHtml = description.replace(/<[^>]*>?/gm, '');
  return withoutHtml.length > 2000 ? `${withoutHtml.substring(0, 2000)}...` : withoutHtml;
};

// --- ROTTA PER IL RATING ---
app.post('/api/rate-book', async (req, res) => {
  try {
    const { book, userPreferences, readingHistory } = req.body;
    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
    }

    const cleanBookDescription = sanitizeDescription(book.description);

    // --- LOG DI CONTROLLO CHE HAI RICHIESTO ---
    if (cleanBookDescription && cleanBookDescription.length > 20) {
      console.log(`✅ Trovata e utilizzata descrizione per "${book.title}" (Lunghezza: ${cleanBookDescription.length} caratteri).`);
    } else {
      console.log(`⚠️ Attenzione: Descrizione per "${book.title}" non trovata o troppo corta. L'analisi si baserà sugli altri dati.`);
    }
    // -----------------------------------------

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `
      Sei un critico letterario d'élite. Esegui un'analisi di compatibilità strutturata.

      1. Profilo Lettore:
         - Generi: ${userPreferences.favoriteGenres?.join(', ') || 'N/A'}
         - Bio: "${userPreferences.bio || 'N/A'}"
         - Vibes: ${userPreferences.vibes?.join(', ') || 'N/A'}

      2. Libro Target:
         - Titolo: ${book.title}
         - Descrizione (fonte primaria): "${cleanBookDescription}"

      3. Analisi e Output JSON OBBLIGATORIO:
      {
        "final_rating": number,
        "short_reasoning": "stringa max 15 parole",
        "positive_points": ["array di 2-3 stringhe"],
        "negative_points": ["array di 1-2 stringhe"]
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Risposta IA non in formato JSON valido.');
    
    res.status(200).json(JSON.parse(jsonMatch[0]));

  } catch (error) {
    console.error('ERRORE CRITICO IN /api/rate-book:', error);
    res.status(500).json({ error: "Errore interno nel server di analisi AI." });
  }
});


// La rotta per la descrizione rimane invariata
app.post('/api/describe-book', async (req, res) => {
    // ...
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server potenziato con LOGS in ascolto sulla porta ${PORT}`);
});
