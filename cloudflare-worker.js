// Cloudflare Worker for Roll-A-Shield Screen Quote Tool
// This worker handles email sending via Resend API and quote storage

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const url = new URL(request.url);

    // Route: Send email via Resend
    if (url.pathname === '/api/send-email' && request.method === 'POST') {
      return await handleSendEmail(request, env);
    }

    // Route: Save quote to D1 database
    if (url.pathname === '/api/save-quote' && request.method === 'POST') {
      return await handleSaveQuote(request, env);
    }

    // Route: Get all quotes
    if (url.pathname === '/api/quotes' && request.method === 'GET') {
      return await handleGetQuotes(request, env);
    }

    // Route: Get specific quote
    if (url.pathname.startsWith('/api/quote/') && request.method === 'GET') {
      const quoteId = url.pathname.split('/')[3];
      return await handleGetQuote(quoteId, env);
    }

    // Route: Delete specific quote
    if (url.pathname.startsWith('/api/quote/') && request.method === 'DELETE') {
      const quoteId = url.pathname.split('/')[3];
      return await handleDeleteQuote(quoteId, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// Send email via Resend API
async function handleSendEmail(request, env) {
  try {
    const emailData = await request.json();

    // Validate required fields
    if (!emailData.to || !emailData.subject || !emailData.html) {
      return jsonResponse({ error: 'Missing required fields: to, subject, html' }, 400);
    }

    // Call Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: emailData.from || 'Roll-A-Shield <onboarding@resend.dev>',
        to: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
        cc: emailData.cc || [],
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text || ''
      })
    });

    const result = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend API error:', result);
      return jsonResponse({
        success: false,
        error: result.message || 'Failed to send email'
      }, resendResponse.status);
    }

    return jsonResponse({
      success: true,
      emailId: result.id,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Error in handleSendEmail:', error);
    return jsonResponse({
      success: false,
      error: error.message
    }, 500);
  }
}

// Save quote to D1 database
async function handleSaveQuote(request, env) {
  try {
    const quoteData = await request.json();

    // Validate required fields
    if (!quoteData.customerName || !quoteData.screens) {
      return jsonResponse({ error: 'Missing required quote data' }, 400);
    }

    const quoteId = quoteData.id || Date.now().toString();
    const timestamp = new Date().toISOString();

    // Insert into D1 database
    await env.DB.prepare(`
      INSERT OR REPLACE INTO quotes (
        id,
        customer_name,
        company_name,
        customer_email,
        customer_phone,
        street_address,
        apt_suite,
        nearest_intersection,
        city,
        state,
        zip_code,
        total_price,
        screen_count,
        quote_data,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      quoteId,
      quoteData.customerName,
      quoteData.companyName || null,
      quoteData.customerEmail || null,
      quoteData.customerPhone || null,
      quoteData.streetAddress || null,
      quoteData.aptSuite || null,
      quoteData.nearestIntersection || null,
      quoteData.city || null,
      quoteData.state || null,
      quoteData.zipCode || null,
      quoteData.orderTotalPrice || quoteData.totalPrice || 0,
      quoteData.screens?.length || 0,
      JSON.stringify(quoteData),
      timestamp,
      timestamp
    ).run();

    return jsonResponse({
      success: true,
      quoteId: quoteId,
      message: 'Quote saved successfully'
    });

  } catch (error) {
    console.error('Error in handleSaveQuote:', error);
    return jsonResponse({
      success: false,
      error: error.message
    }, 500);
  }
}

// Get all quotes
async function handleGetQuotes(request, env) {
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') || 100;
    const offset = url.searchParams.get('offset') || 0;

    const results = await env.DB.prepare(`
      SELECT
        id,
        customer_name,
        company_name,
        customer_email,
        total_price,
        screen_count,
        created_at,
        updated_at
      FROM quotes
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return jsonResponse({
      success: true,
      quotes: results.results,
      count: results.results.length
    });

  } catch (error) {
    console.error('Error in handleGetQuotes:', error);
    return jsonResponse({
      success: false,
      error: error.message
    }, 500);
  }
}

// Get specific quote
async function handleGetQuote(quoteId, env) {
  try {
    const result = await env.DB.prepare(`
      SELECT * FROM quotes WHERE id = ?
    `).bind(quoteId).first();

    if (!result) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    // Parse the full quote data
    const quoteData = JSON.parse(result.quote_data);

    return jsonResponse({
      success: true,
      quote: quoteData
    });

  } catch (error) {
    console.error('Error in handleGetQuote:', error);
    return jsonResponse({
      success: false,
      error: error.message
    }, 500);
  }
}

// Delete specific quote
async function handleDeleteQuote(quoteId, env) {
  try {
    if (!quoteId) {
      return jsonResponse({ error: 'Quote ID is required' }, 400);
    }

    const result = await env.DB.prepare(`
      DELETE FROM quotes WHERE id = ?
    `).bind(quoteId).run();

    if (result.meta.changes === 0) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    return jsonResponse({
      success: true,
      message: 'Quote deleted successfully'
    });

  } catch (error) {
    console.error('Error in handleDeleteQuote:', error);
    return jsonResponse({
      success: false,
      error: error.message
    }, 500);
  }
}

// Helper function for JSON responses with CORS
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
