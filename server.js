import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- FUNZIONE DI PULIZIA DEFINITIVA ---
// Questa funzione ora vive sul server, garantendo che i dati siano sempre puliti.
const sanitizeDescription = (description) => {
  if (!description) return 'Nessuna descrizione fornita.';
  // Rimuove i tag HTML e altri artefatti comuni
  const withoutHtml = description.replace(/<[^>]*>?/gm, '');
  // Tronca a una lunghezza sicura per l'IA
  return withoutHtml.length > 2000 ? `${withoutHtml.substring(0, 2000)}...` : withoutHtml;
};

// --- ROTTA PER IL RATING (ORA USA LA DESCRIZIONE PULITA) ---
app.post('/api/rate-book', async (req, res) => {
  try {
    const { book, userPreferences, readingHistory } = req.body;
    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
    }

    // --- PULIZIA DEI DATI ALL'INTERNO DEL SERVER ---
    const cleanBookDescription = sanitizeDescription(book.description);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `
      Sei un critico letterario e un book advisor d'élite. La tua unica missione è eseguire un'analisi di compatibilità accurata, basandoti sui dati forniti.

      **PROCESSO DI ANALISI OBBLIGATORIO:**

      **1. Analisi Profilo Lettore:**
      * Generi Preferiti: ${userPreferences.favoriteGenres?.join(', ') || 'Non specificati'}
      * Bio / Cosa Cerca: "${userPreferences.bio || 'Non specificata'}"
      * Vibes Desiderate: ${userPreferences.vibes?.join(', ') || 'Non specificate'}

      **2. Analisi del Libro Target (usando la descrizione pulita):**
      * Titolo: ${book.title}
      * Descrizione: "${cleanBookDescription}"  // <-- USA LA DESCRIZIONE PULITA
      * Categorie: ${book.categories?.join(', ')}

      **3. Analisi Comparativa:**
      * Affinità Trama: Confronta la **descrizione** del libro con la **bio** del lettore. La trama soddisfa ciò che il lettore cerca?
      * Affinità Stile/Vibes: Il tono della **descrizione** è in linea con le **vibes** desiderate?

      **4. Output Strutturato:**
      Fornisci la tua analisi ESCLUSIVAMENTE in formato JSON.

      **STRUTTURA JSON DI OUTPUT OBBLIGATORIA:**
      {
        "final_rating": number,
        "short_reasoning": "stringa singola di massimo 15 parole",
        "positive_points": ["array di 2-3 stringhe sui motivi per cui potrebbe piacere"],
        "negative_points": ["array di 1-2 stringhe sui potenziali punti deboli"]
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Risposta IA non in formato JSON valido.');
    
    res.status(200).json(JSON.parse(jsonMatch[0]));

  } catch (error) {
    console.error('ERRORE CRITICO NEL SERVER /api/rate-book:', error);
    res.status(500).json({ error: "Errore interno nel server di analisi AI." });
  }
});

// --- ROTTA PER LA DESCRIZIONE (ORA USA LA DESCRIZIONE PULITA) ---
app.post('/api/describe-book', async (req, res) => {
    try {
        const { book } = req.body;
        if (!book) return res.status(400).json({ error: 'Dati del libro mancanti.' });

        // --- PULIZIA DEI DATI ALL'INTERNO DEL SERVER ---
        const cleanBookDescription = sanitizeDescription(book.description);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
            Sei un editor letterario. Crea una scheda di approfondimento per un libro.
            Restituisci ESCLUSIVAMENTE un oggetto JSON con questa struttura:
            {
              "enhanced_description": "Riscrivi la descrizione originale per renderla più avvincente.",
              "key_themes": ["array di 3-4 temi principali"],
              "target_audience": "Descrivi il tipo di lettore a cui consiglieresti questo libro."
            }

            DATI DEL LIBRO:
            - Titolo: ${book.title}
            - Descrizione: "${cleanBookDescription}" // <-- USA LA DESCRIZIONE PULITA
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Risposta IA non in formato JSON.');

        res.status(200).json(JSON.parse(jsonMatch[0]));

    } catch (error) {
        console.error('ERRORE CRITICO NEL SERVER /api/describe-book:', error);
        res.status(500).json({ error: "Impossibile generare la descrizione del libro." });
    }
});


// AVVIO DEL SERVER
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server potenziato in ascolto sulla porta ${PORT}`);
});
