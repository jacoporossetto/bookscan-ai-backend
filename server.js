import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import 'dotenv/config';

const app = express();

// --- CONFIGURAZIONE CORS FINALE E CORRETTA ---
// Abilita le richieste da QUALSIASI origine. Questo è il modo standard
// per un backend che deve servire un'app mobile o una web app pubblica.
app.use(cors()); 

// Middleware per interpretare il corpo delle richieste JSON
app.use(express.json());

// Inizializza l'IA leggendo la chiave API dalle variabili d'ambiente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


// --- ROTTA PER IL RATING (CON GESTIONE ERRORI MIGLIORATA) ---
app.post('/api/rate-book', async (req, res) => {
  try {
    const { book, userPreferences, readingHistory } = req.body;

    if (!book || !userPreferences) {
      return res.status(400).json({ error: 'Dati del libro o preferenze utente mancanti.' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `
      Sei un critico letterario e un book advisor d'élite, con una profonda comprensione della psicologia dei lettori. Il tuo compito è eseguire un'analisi di compatibilità estremamente accurata e strutturata.

      PROCESSO DI ANALISI OBBLIGATORIO (Chain of Thought):
      1. Analisi Profilo Lettore: Assimila il profilo del lettore per capire i suoi desideri.
         - Generi Preferiti: ${userPreferences.favoriteGenres?.join(', ') || 'Non specificati'}
         - Bio / Cosa Cerca in una Storia: "${userPreferences.bio || 'Non specificata'}"
         - Vibes / Atmosfere Desiderate: ${userPreferences.vibes?.join(', ') || 'Non specificate'}

      2. Analisi del Libro Target: Analizza il libro, usando la descrizione come fonte primaria.
         - Titolo: ${book.title}
         - Descrizione (fonte di verità per trama e stile): "${book.description}"
         - Categorie Fornite: ${book.categories?.join(', ')}

      3. Analisi Comparativa con Punteggi Parziali (da 1.0 a 5.0):
         - Affinità Trama (Peso 50%): La descrizione del libro promette una trama che si allinea con la bio del lettore? Valuta e assegna un punteggio.
         - Affinità Stile/Vibes (Peso 30%): Il tono della descrizione suggerisce un'atmosfera in linea con le vibes desiderate? Valuta e assegna un punteggio.
         - Affinità Genere (Peso 20%): Le categorie del libro combaciano con i generi preferiti? Considera generi affini. Valuta e assegna un punteggio.

      4. Calcolo Punteggio Finale e Output:
         - Calcola il punteggio finale come media ponderata dei tre sotto-punteggi.
         - Basandoti sulla qualità delle informazioni, determina il tuo livello di confidenza.
         - Estrai i punti chiave positivi e negativi.
         - Fornisci la tua analisi ESCLUSIVAMENTE in formato JSON.

      STRUTTURA JSON DI OUTPUT OBBLIGATORIA:
      {
        "rating_details": { "plot_affinity": { "score": number, "reason": "stringa" }, "style_affinity": { "score": number, "reason": "stringa" }, "genre_affinity": { "score": number, "reason": "stringa" } },
        "final_rating": number,
        "confidence_level": "stringa ('Alta', 'Media' o 'Bassa')",
        "short_reasoning": "stringa",
        "positive_points": ["array di stringhe"],
        "negative_points": ["array di stringhe"]
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('La risposta dell\'IA per il rating non è in formato JSON valido.');
    }
    
    const jsonData = JSON.parse(jsonMatch[0]);
    res.status(200).json(jsonData);

  } catch (error) {
    console.error('ERRORE CRITICO NEL SERVER:', error);
    res.status(500).json({ error: "Si è verificato un errore interno nel server di analisi AI." });
  }
});


// --- ROTTA PER LA DESCRIZIONE DEL LIBRO (CON GESTIONE ERRORI MIGLIORATA) ---
app.post('/api/describe-book', async (req, res) => {
    try {
        const { book } = req.body;
        if (!book) {
            return res.status(400).json({ error: 'Dati del libro mancanti.' });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
            Sei un editor letterario. Il tuo compito è creare una scheda di approfondimento per un libro.
            Restituisci ESCLUSIVAMENTE un oggetto JSON con la seguente struttura:
            {
              "enhanced_description": "stringa. Riscrivi la descrizione originale per renderla più avvincente.",
              "key_themes": ["array di 3-4 stringhe con i temi principali del libro"],
              "target_audience": "stringa. Descrivi il tipo di lettore a cui consiglieresti questo libro."
            }

            DATI DEL LIBRO:
            - Titolo: ${book.title}
            - Autori: ${book.authors?.join(', ')}
            - Descrizione Originale: ${book.description}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Risposta IA per descrizione non in formato JSON.');
        
        const jsonData = JSON.parse(jsonMatch[0]);
        res.status(200).json(jsonData);

    } catch (error) {
        console.error('ERRORE CRITICO NEL SERVER:', error);
        res.status(500).json({ error: "Impossibile generare la descrizione del libro." });
    }
});


// --- AVVIO DEL SERVER ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
