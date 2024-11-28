import { type NextApiRequest, type NextApiResponse } from "next";
import { pipeline } from '@xenova/transformers';

// Remove Edge runtime config as it might be causing issues
// export const config = {
//   runtime: 'edge',
//   regions: ['fra1'],
// };

let summarizer: any = null;

async function initializeSummarizer() {
  try {
    if (!summarizer) {
      console.log('[DEBUG] Initializing summarizer pipeline...');
      summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
      console.log('[DEBUG] Summarizer pipeline initialized successfully');
    }
    return summarizer;
  } catch (error) {
    console.error('[DEBUG] Error initializing summarizer:', error);
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('[DEBUG] Request received:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[DEBUG] Request body:', req.body);
    const { transcripts } = req.body;

    if (!Array.isArray(transcripts)) {
      console.log('[DEBUG] Invalid transcripts format:', transcripts);
      return res.status(400).json({ error: 'Transcripts must be an array' });
    }

    if (transcripts.length === 0) {
      return res.status(400).json({ error: 'Transcripts array is empty' });
    }

    const fullText = transcripts.join('\n');
    console.log(`[DEBUG] Combined text length: ${fullText.length}`);

    if (!fullText.trim()) {
      return res.status(400).json({ error: 'No valid transcript content provided' });
    }

    // Initialize summarizer with detailed error logging
    let currentSummarizer;
    try {
      console.log('[DEBUG] Attempting to initialize summarizer');
      currentSummarizer = await initializeSummarizer();
      console.log('[DEBUG] Summarizer initialized successfully');
    } catch (initError) {
      console.error('[DEBUG] Failed to initialize summarizer:', initError);
      return res.status(500).json({ 
        error: 'Failed to initialize summarizer',
        details: initError instanceof Error ? initError.message : 'Unknown error'
      });
    }

    // Generate summary with detailed error logging
    try {
      console.log('[DEBUG] Starting summary generation');
      const result = await currentSummarizer(fullText, {
        max_length: 250,
        min_length: 50,
        length_penalty: 2.0,
        num_beams: 4,
        early_stopping: true,
        do_sample: false
      });
      console.log('[DEBUG] Summary generation completed');

      if (!result?.[0]?.summary_text) {
        console.error('[DEBUG] Invalid summarizer response:', result);
        return res.status(500).json({ error: 'Invalid response from summarizer' });
      }

      return res.status(200).json({ summary: result[0].summary_text });
    } catch (summaryError) {
      console.error('[DEBUG] Error during summary generation:', summaryError);
      return res.status(500).json({ 
        error: 'Failed to generate summary',
        details: summaryError instanceof Error ? summaryError.message : 'Unknown error'
      });
    }
  } catch (error: unknown) {
    console.error('[DEBUG] Unexpected error:', error);
    
    if (error instanceof Error) {
      return res.status(500).json({ 
        error: 'Failed to generate summary',
        message: error.message,
        name: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
    
    return res.status(500).json({ error: 'Failed to generate summary' });
  }
}
