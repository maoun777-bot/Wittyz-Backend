const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the request body
    const { title, language, questionCount, description } = JSON.parse(event.body);

    console.log('Received quiz generation request:', { title, language, questionCount });

    // Validate inputs
    if (!title || !language || !questionCount || !description) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Create the prompt for Claude
    const prompt = `Create a ${language} quiz with ${questionCount} multiple-choice questions about: ${description}

Title: ${title}

CRITICAL: Return ONLY valid JSON with this EXACT structure (no markdown, no explanation):
{
  "title": "${title}",
  "questions": [
    {
      "text": "Question text",
      "answers": ["Answer 1", "Answer 2", "Answer 3", "Answer 4"],
      "correct": 1
    }
  ]
}

Requirements:
- Each question: 4 answer choices
- Correct answer: number 1-4
- Keep questions concise but clear
- Vary difficulty levels
- Make distractors plausible`;

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    // Extract the response text
    let responseText = '';
    for (const block of message.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    console.log('Raw AI response:', responseText.substring(0, 200));

    // Clean up the response - remove markdown code blocks if present
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
    }

    // Parse the JSON response
    const quizData = JSON.parse(cleanedResponse);

    // Validate the quiz structure
    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      throw new Error('Invalid quiz structure: missing questions array');
    }

    if (quizData.questions.length !== parseInt(questionCount)) {
      console.warn(`Expected ${questionCount} questions but got ${quizData.questions.length}`);
    }

    // Validate each question
    for (let i = 0; i < quizData.questions.length; i++) {
      const q = quizData.questions[i];
      if (!q.text || !q.answers || !Array.isArray(q.answers) || q.answers.length !== 4 || !q.correct) {
        throw new Error(`Invalid question structure at index ${i}`);
      }
      if (q.correct < 1 || q.correct > 4) {
        throw new Error(`Invalid correct answer index at question ${i}: ${q.correct}`);
      }
    }

    console.log('Quiz generated successfully:', quizData.questions.length, 'questions');

    // Return the quiz data
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify(quizData)
    };

  } catch (error) {
    console.error('Error generating quiz:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to generate quiz',
        details: error.message 
      })
    };
  }
};
