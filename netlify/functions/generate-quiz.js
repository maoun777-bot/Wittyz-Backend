// File: netlify/functions/generate-quiz.js

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { title, language, numQuestions, description } = JSON.parse(event.body);

    // Validate input
    if (!title || !language || !numQuestions || !description) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Construct the prompt for Claude
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

Important: Return ONLY the JSON array, nothing else.`;

    // Call Anthropic Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022', // Fast and cost-effective
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Claude API Error:', error);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Failed to generate quiz', details: error })
      };
    }

    const data = await response.json();
    
    // Extract text from Claude's response
    let quizContent = data.content[0].text.trim();

    // Remove markdown code blocks if present
    quizContent = quizContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    // Parse the JSON response
    let questions;
    try {
      questions = JSON.parse(quizContent);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', quizContent);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          error: 'Failed to parse quiz data',
          details: parseError.message,
          rawContent: quizContent
        })
      };
    }

    // Validate the response structure
    if (!Array.isArray(questions) || questions.length === 0) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Invalid quiz format received from AI' })
      };
    }

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
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
