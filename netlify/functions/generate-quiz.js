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

    // Optimized prompt - more concise, clearer instructions
    const prompt = `Generate ${numQuestions} quiz questions in ${language}.

Topic: ${title}
Details: ${description}

Return ONLY a JSON array, no other text:
[{"question":"...","answer1":"...","answer2":"...","answer3":"...","answer4":"...","correctAnswer":1}]

Rules:
- Exactly ${numQuestions} questions
- 4 answers each, one correct (1-4)
- Randomize correct answer position
- All text in ${language}`;

    // Call Anthropic Claude API with streaming
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4096,
        stream: true,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.4
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

    // Process the stream and collect the full response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullContent += parsed.delta.text;
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
      }
    }

    // Clean up the response
    let quizContent = fullContent.trim();
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
          rawContent: quizContent.substring(0, 500)
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
