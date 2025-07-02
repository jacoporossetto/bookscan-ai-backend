import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- FUNZIONE DI PULIZIA DEFINITIVA ---
// Rimuove i tag HTML e altri artefatti comuni, garantendo testo pulito.
const sanitizeDescription = (description) => {
  if (!description) return ''; // Restituisce una stringa vuota se non c'è descrizione.
  // Rimuove tag HTML, entità HTML (es. &amp;) e spazi extra.
  const withoutHtml = description.replace(/<[^>]*>?/gm, ' ').replace(/&[a-z]+;/gi, ' ');
  const singleSpace = withoutHtml.replace(/\s+/g, ' ').trim();
  // Tronca a una lunghezza sicura per l'IA.
  return singleSpace.length > 2000 ? `${singleSpace.substring(0, 2000)}...` : singleSpace;
};

// --- ROTTA PER IL RATING (ORA USA LA DESCRIZIONE PULITA) ---
app.post('/api/rate-book', async (req, res) => {
  try {
    const { book, userPreferences, readingHistory } = req.body;
    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
    }

    // --- PULIZIA DEI DATI E LOG DI CONTROLLO ---
    const cleanBookDescription = sanitizeDescription(book.description);
    if (cleanBookDescription) {
      console.log(`✅ OK: Descrizione per "${book.title}" pulita e pronta per l'analisi (Lunghezza: ${cleanBookDescription.length}).`);
    } else {
      console.log(`⚠️ ATTENZIONE: Descrizione per "${book.title}" non trovata o vuota dopo la pulizia.`);
    }
    // ---------------------------------------------

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `
      Sei un critico letterario e book advisor d'élite. La tua missione è eseguire un'analisi di compatibilità accurata basandoti sui dati forniti. La DESCRIZIONE del libro è la fonte più importante.

      **PROCESSO DI ANALISI OBBLIGATORIO:**
      1.  **Analisi Profilo Lettore:**
          * Generi Preferiti: ${userPreferences.favoriteGenres?.join(', ') || 'N/A'}
          * Bio/Cosa Cerca: "${userPreferences.bio || 'N/A'}"
          * Vibes Desiderate: ${userPreferences.vibes?.join(', ') || 'N/A'}
      2.  **Analisi Libro Target (basata sulla descrizione pulita):**
          * Titolo: ${book.title}
          * Descrizione Fornita: "${cleanBookDescription}"
      3.  **Analisi Comparativa:** Basandoti sulla **descrizione**, valuta l'affinità della trama e dello stile con le preferenze del lettore.
      4.  **Output JSON Obbligatorio:**
          {
            "final_rating": number,
            "short_reasoning": "stringa max 15 parole che riassume il tuo giudizio",
            "positive_points": ["array di 2-3 motivi per cui potrebbe piacere, basati sulla descrizione"],
            "negative_points": ["array di 1-2 potenziali punti deboli, basati sulla descrizione"]
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


// --- ROTTA PER LA DESCRIZIONE DEL LIBRO (ORA USA LA DESCRIZIONE PULITA) ---
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
            - Autori: ${book.authors?.join(', ')}
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
  console.log(`Server potenziato con LOGS in ascolto sulla porta ${PORT}`);
});
