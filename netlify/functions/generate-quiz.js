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

Requirements:
- Generate exactly ${numQuestions} questions
- Each question must have exactly 4 answer choices
- Mark one answer as correct (use a number 1-4)
- The correct answer position should be randomized among the 4 choices
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

Important: Return ONLY the JSON array, nothing else. No markdown code blocks, no explanations.`;

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
