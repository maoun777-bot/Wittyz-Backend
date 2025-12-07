// netlify/functions/get-quiz-detail.js
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const fetch = require('node-fetch');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const pathParts = event.path.split('/');
    const quizId = pathParts[pathParts.length - 1];

    if (!quizId || quizId === 'get-quiz-detail') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Quiz ID is required' })
      };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: Missing or invalid token' })
      };
    }

    const token = authHeader.substring(7);

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      console.error('Token verification failed:', error);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized: Invalid token' })
      };
    }

    const userId = decodedToken.uid;

    const doc = await db.collection('quizzes').doc(quizId).get();

    if (!doc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Quiz not found' })
      };
    }

    const quizData = doc.data();

    if (quizData.userId !== userId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Forbidden: You do not own this quiz' })
      };
    }

    const excelResponse = await fetch(quizData.fileUrl);
    if (!excelResponse.ok) {
      throw new Error('Failed to download Excel file');
    }

    const buffer = await excelResponse.buffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    const questions = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 6 && row[0]) {
        questions.push({
          id: `q${i}`,
          text: String(row[0]).trim(),
          answers: [
            String(row[1] || '').trim(),
            String(row[2] || '').trim(),
            String(row[3] || '').trim(),
            String(row[4] || '').trim()
          ],
          correctIndex: parseInt(row[5]) || 1
        });
      }
    }

    const quizDetail = {
      id: doc.id,
      title: quizData.title,
      questions: questions
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
      },
      body: JSON.stringify(quizDetail)
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
```

5. Click **"Commit changes"** → **"Commit changes"**

---

### **File 3: Create `_redirects`**

1. Click **"Wittyz-Backend"** at the top to go back to the root
2. Click **"Add file"** → **"Create new file"**
3. In the filename box, type exactly: `_redirects` (no extension!)
4. Copy and paste this:
```
# API endpoints for iOS app
/api/quizzes              /.netlify/functions/get-quizzes            200
/api/quizzes/:id          /.netlify/functions/get-quiz-detail        200

# Default fallback
/*                        /index.html                                 200
