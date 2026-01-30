// File: netlify/functions/generate-quiz.js
// AI Quiz Generation using Google Gemini

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { title, language, numQuestions, description } = JSON.parse(event.body);

    // Validate input
    if (!title || !language || !numQuestions || !description) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    console.log('Generating quiz with Gemini:', { title, language, numQuestions });

    // Construct the prompt for Gemini
    const prompt = `Create a quiz with exactly ${numQuestions} multiple choice questions based on the following specifications:

Title: ${title}
Language: ${language}
Description: ${description}

CRITICAL Requirements:
- Generate exactly ${numQuestions} questions
- Each question must have exactly 4 answer choices
- IMPORTANT: The correct answer position MUST be randomized - distribute correct answers roughly equally across positions 1, 2, 3, and 4. Do NOT put all correct answers in position 1.
- Mark the correct answer with its position number (1, 2, 3, or 4)
- Questions should match the style and difficulty described
- All content must be in ${language}

Return ONLY a valid JSON array with this exact structure (no markdown, no additional text, no explanation):
[
  {
    "question": "Question text here",
    "answer1": "First choice",
    "answer2": "Second choice", 
    "answer3": "Third choice",
    "answer4": "Fourth choice",
    "correctAnswer": 2
  }
]

REMINDER: Randomize which answer (1, 2, 3, or 4) is correct for each question. Do not make the first answer always correct.

Return ONLY the JSON array, nothing else. No markdown code blocks, no explanations.`;

    // Call Google Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not set');
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_ONLY_HIGH"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_ONLY_HIGH"
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', response.status, errorText);
      return {
        statusCode: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          error: 'Failed to generate quiz', 
          details: errorText 
        })
      };
    }

    const data = await response.json();
    
    // Extract text from Gemini's response
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Unexpected Gemini response structure:', JSON.stringify(data));
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          error: 'Unexpected response from AI',
          details: data
        })
      };
    }

    let quizContent = data.candidates[0].content.parts[0].text.trim();
    console.log('Raw Gemini response:', quizContent.substring(0, 200) + '...');

    // Remove markdown code blocks if present
    quizContent = quizContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse the JSON response
    let questions;
    try {
      questions = JSON.parse(quizContent);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', quizContent);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          error: 'Failed to parse quiz data',
          details: parseError.message,
          rawContent: quizContent.substring(0, 500)
        })
      };
    }

    // Validate the response structure
    if (!Array.isArray(questions) || questions.length === 0) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid quiz format received from AI' })
      };
    }

    // Post-process: Randomize answer positions if they seem non-random
    // Check if most correct answers are in the same position
    const correctPositions = questions.map(q => q.correctAnswer);
    const positionCounts = [0, 0, 0, 0, 0]; // index 0 unused, 1-4 for positions
    correctPositions.forEach(pos => {
      if (pos >= 1 && pos <= 4) positionCounts[pos]++;
    });
    
    const maxCount = Math.max(...positionCounts.slice(1));
    const threshold = questions.length * 0.6; // If 60%+ in same position, randomize
    
    if (maxCount > threshold) {
      console.log('Detected non-random answer positions, shuffling...');
      questions = questions.map(q => {
        // Create array of answer keys and shuffle
        const answers = [q.answer1, q.answer2, q.answer3, q.answer4];
        const correctAnswer = answers[q.correctAnswer - 1];
        
        // Fisher-Yates shuffle
        for (let i = answers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [answers[i], answers[j]] = [answers[j], answers[i]];
        }
        
        // Find new position of correct answer
        const newCorrectPosition = answers.indexOf(correctAnswer) + 1;
        
        return {
          question: q.question,
          answer1: answers[0],
          answer2: answers[1],
          answer3: answers[2],
          answer4: answers[3],
          correctAnswer: newCorrectPosition
        };
      });
      console.log('Answer positions randomized successfully');
    }

    console.log(`Successfully generated ${questions.length} questions`);

    // Return the generated quiz
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        questions: questions
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
