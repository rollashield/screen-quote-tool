// Cloudflare Worker for Roll-A-Shield Screen Quote Tool
// This worker handles email sending via Resend API, quote storage, and Airtable CRM integration

// ─── Airtable Configuration ────────────────────────────────────────────────────
const AIRTABLE_BASE_ID = 'appaKEVA8DolQ9zo2';
const AIRTABLE_BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;

const AT_TABLES = {
  contacts: 'tblHZEP2tZVU8wUoI',
  opportunities: 'tblCIUFpjmay1GoMf',
  quotes: 'tbl6RLxDgiawz9olk'
};

const AT_FIELDS = {
  contacts: {
    name: 'fldRN4XeJLbIqvE4I',
    firstName: 'fld4FQOVkmVw66G07',
    lastName: 'fldcAQfh7s69E6vsp',
    email: 'fldSFKtnKBvE1Fpjh',
    phone: 'fldyaBHgXeNwXlzsQ',
    streetAddress: 'fld5UT5trvwuvCmMj',
    city: 'fldVnQWPGz0z4Cy9S',
    state: 'fldf5RZ2pI4eePwea',
    zipCode: 'fldgIcm6aPFTBOSZy',
    companyName: 'fldjzu3JEVWqk2m51',
    opportunities: 'fldbiz3Qo6mf5sp5K'
  },
  opportunities: {
    name: 'fldWtxrddE9syQObH',
    contacts: 'fldrEwzXiVNddYkaU',
    status: 'fldurfMg1vz50dPy3',
    quotes: 'fldOlBGnbtFYiCbZM',
    dateTime: 'fldS7ocJhrULpGKCy',
    salesRep: 'fldKcKKuoNWVRGOlU'
  },
  quotes: {
    opportunity: 'fldkkJKXsjTXzgh1F',
    contacts: 'fldrStoewOhMT5KuX',
    totalAmount: 'fldr1eVkNZs40eCvm',
    quoteNumber: 'fld8OiEjdkpTuzbxl',
    quoteType: 'fldRNy09mivZh33mN',
    status: 'fldmLV8m91IdBhv48',
    type: 'fldAUUDSGQGw6z8hf',
    quoteCheckbox: 'fldRuuwuZUztxUXPQ',
    notes: 'fldCy96gnMlFvIl13',
    date: 'fldfc4yRtpFPBj05B'
  }
};

// ─── Main Router ───────────────────────────────────────────────────────────────
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

    // Route: Save quote to D1 database (+ Airtable sync)
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

    // Route: Search Airtable Opportunities
    if (url.pathname === '/api/airtable/opportunities/search' && request.method === 'GET') {
      return await handleOpportunitySearch(request, env);
    }

    // Route: List all Sales Reps
    if (url.pathname === '/api/airtable/sales-reps' && request.method === 'GET') {
      return await handleListSalesReps(env);
    }

    // Route: Update Opportunity Sales Rep
    if (url.pathname === '/api/airtable/opportunities/update-rep' && request.method === 'POST') {
      return await handleUpdateOpportunitySalesRep(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// ─── Airtable Helper ───────────────────────────────────────────────────────────
async function airtableFetch(env, path, options = {}) {
  const url = `${AIRTABLE_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Airtable API error (${response.status}):`, errorBody);
    throw new Error(`Airtable API error: ${response.status}`);
  }

  return response.json();
}

// ─── Quote Number Generation ───────────────────────────────────────────────────
async function generateQuoteNumber(env) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `Q${yy}${mm}`;

  // Query D1 for the highest existing quote number in this period
  const result = await env.DB.prepare(`
    SELECT quote_number FROM quotes
    WHERE quote_number LIKE ?
    ORDER BY quote_number DESC
    LIMIT 1
  `).bind(`${prefix}-%`).first();

  let nextSeq = 1;
  if (result && result.quote_number) {
    const parts = result.quote_number.split('-');
    if (parts.length === 2) {
      nextSeq = parseInt(parts[1], 10) + 1;
    }
  }

  return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
}

// ─── Quote Notes Builder ───────────────────────────────────────────────────────
function buildQuoteNotes(quoteData) {
  let notes = '';

  // Internal comments first
  if (quoteData.internalComments) {
    notes += quoteData.internalComments + '\n\n';
  }

  // Auto-generated summary
  notes += '--- Quote Summary ---\n';
  notes += `Screens: ${quoteData.screens?.length || 0}\n`;
  notes += `Total: $${(quoteData.orderTotalPrice || 0).toFixed(2)}\n`;

  if (quoteData.screens && quoteData.screens.length > 0) {
    quoteData.screens.forEach((screen, i) => {
      const name = screen.screenName || `Screen ${i + 1}`;
      notes += `\n${name}: ${screen.trackTypeName || screen.trackType}`;
      notes += `, ${screen.operatorTypeName || screen.operatorType}`;
      notes += `, ${screen.actualWidthDisplay} x ${screen.actualHeightDisplay}`;
      notes += `, ${screen.fabricColorName || 'N/A'} fabric, ${screen.frameColorName || 'N/A'} frame`;
      if (screen.accessories && screen.accessories.length > 0) {
        notes += `\n  Accessories: ${screen.accessories.map(a => a.name).join(', ')}`;
      }
    });
  }

  if (quoteData.discountPercent > 0) {
    notes += `\n\nDiscount: ${quoteData.discountLabel || 'Discount'} (${quoteData.discountPercent}%)`;
  }

  return notes;
}

// ─── Airtable Opportunity Search ───────────────────────────────────────────────
async function handleOpportunitySearch(request, env) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') || '').trim();

    if (query.length < 2) {
      return jsonResponse({ error: 'Search query must be at least 2 characters' }, 400);
    }

    // Sanitize query for Airtable formula (escape double quotes and backslashes)
    const sanitizedQuery = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    // Search Opportunities by Name, exclude Closed Lost, sort newest first
    const formula = `AND(SEARCH(LOWER("${sanitizedQuery}"), LOWER({Name})), {Status} != "Closed Lost")`;

    // Airtable needs fields[] as repeated params
    const fieldParams = ['Name', 'Contacts', 'Status', 'Date & Time', 'Sales Rep', 'Sales Rep Name', 'Sales Rep Email']
      .map(f => `fields%5B%5D=${encodeURIComponent(f)}`)
      .join('&');

    const oppPath = `/${AT_TABLES.opportunities}?filterByFormula=${encodeURIComponent(formula)}&sort%5B0%5D%5Bfield%5D=${encodeURIComponent('Date & Time')}&sort%5B0%5D%5Bdirection%5D=desc&pageSize=20&${fieldParams}`;

    const oppResult = await airtableFetch(env, oppPath);
    const opportunities = oppResult.records || [];

    if (opportunities.length === 0) {
      return jsonResponse({ success: true, opportunities: [] });
    }

    // Collect all unique Contact record IDs
    const contactIds = new Set();
    opportunities.forEach(opp => {
      const contacts = opp.fields['Contacts'] || [];
      contacts.forEach(id => contactIds.add(id));
    });

    // Batch-fetch all Contact records in one request
    const contactMap = {};
    if (contactIds.size > 0) {
      const contactFormula = `OR(${[...contactIds].map(id => `RECORD_ID()='${id}'`).join(',')})`;
      const contactFields = ['First Name', 'Last Name', 'Email', 'Phone', 'Street Address', 'City', 'State', 'Zip Code', 'Company Name']
        .map(f => `fields%5B%5D=${encodeURIComponent(f)}`)
        .join('&');

      const contactPath = `/${AT_TABLES.contacts}?filterByFormula=${encodeURIComponent(contactFormula)}&${contactFields}`;
      const contactResult = await airtableFetch(env, contactPath);

      (contactResult.records || []).forEach(rec => {
        contactMap[rec.id] = {
          id: rec.id,
          firstName: rec.fields['First Name'] || '',
          lastName: rec.fields['Last Name'] || '',
          email: rec.fields['Email'] || '',
          phone: rec.fields['Phone'] || '',
          streetAddress: rec.fields['Street Address'] || '',
          city: rec.fields['City'] || '',
          state: rec.fields['State'] || '',
          zipCode: rec.fields['Zip Code'] || '',
          companyName: rec.fields['Company Name'] || ''
        };
      });
    }

    // Collect Sales Rep record IDs for phone lookup
    const salesRepIds = new Set();
    opportunities.forEach(opp => {
      const reps = opp.fields['Sales Rep'] || [];
      reps.forEach(id => salesRepIds.add(id));
    });

    // Batch-fetch Sales Rep records for phone numbers
    const salesRepMap = {};
    if (salesRepIds.size > 0) {
      const repFormula = `OR(${[...salesRepIds].map(id => `RECORD_ID()='${id}'`).join(',')})`;
      const repFields = ['Name', 'Email', 'Phone']
        .map(f => `fields%5B%5D=${encodeURIComponent(f)}`)
        .join('&');

      const repPath = `/tblBtKFE2ZM5CE3MD?filterByFormula=${encodeURIComponent(repFormula)}&${repFields}`;
      const repResult = await airtableFetch(env, repPath);

      (repResult.records || []).forEach(rec => {
        salesRepMap[rec.id] = {
          phone: rec.fields['Phone'] || ''
        };
      });
    }

    // Build response with nested Contact and Sales Rep data
    const results = opportunities.map(opp => {
      const oppContactIds = opp.fields['Contacts'] || [];
      const contact = oppContactIds.length > 0 ? (contactMap[oppContactIds[0]] || null) : null;

      // Sales Rep info from lookup fields + phone from Sales Rep record
      const salesRepRecordIds = opp.fields['Sales Rep'] || [];
      const salesRepNameArr = opp.fields['Sales Rep Name'] || [];
      const salesRepEmailArr = opp.fields['Sales Rep Email'] || [];
      const salesRepPhone = salesRepRecordIds.length > 0 ? (salesRepMap[salesRepRecordIds[0]]?.phone || '') : '';

      return {
        id: opp.id,
        name: opp.fields['Name'] || '',
        status: opp.fields['Status'] || '',
        dateTime: opp.fields['Date & Time'] || '',
        contact: contact,
        salesRep: salesRepNameArr.length > 0 ? {
          id: salesRepRecordIds[0] || '',
          name: salesRepNameArr[0] || '',
          email: salesRepEmailArr[0] || '',
          phone: salesRepPhone
        } : null
      };
    });

    return jsonResponse({ success: true, opportunities: results });

  } catch (error) {
    console.error('Error in handleOpportunitySearch:', error);
    return jsonResponse({
      success: false,
      error: 'Airtable is temporarily unavailable. You can enter customer information manually.'
    }, 503);
  }
}

// ─── List All Sales Reps ──────────────────────────────────────────────────────
async function handleListSalesReps(env) {
  try {
    const repFields = ['Name', 'Email', 'Phone']
      .map(f => `fields%5B%5D=${encodeURIComponent(f)}`)
      .join('&');

    const repPath = `/tblBtKFE2ZM5CE3MD?${repFields}&sort%5B0%5D%5Bfield%5D=Name&sort%5B0%5D%5Bdirection%5D=asc`;
    const repResult = await airtableFetch(env, repPath);

    const reps = (repResult.records || []).map(rec => ({
      id: rec.id,
      name: rec.fields['Name'] || '',
      email: rec.fields['Email'] || '',
      phone: rec.fields['Phone'] || ''
    }));

    return jsonResponse({ success: true, salesReps: reps });
  } catch (error) {
    console.error('Error listing sales reps:', error);
    return jsonResponse({ success: false, error: 'Failed to load sales reps' }, 500);
  }
}

// ─── Update Opportunity Sales Rep ─────────────────────────────────────────────
async function handleUpdateOpportunitySalesRep(request, env) {
  try {
    const body = await request.json();
    const { opportunityId, salesRepId } = body;

    if (!opportunityId || !salesRepId) {
      return jsonResponse({ error: 'opportunityId and salesRepId are required' }, 400);
    }

    // Update the Opportunity's Sales Rep linked record field
    await airtableFetch(env, `/${AT_TABLES.opportunities}/${opportunityId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          [AT_FIELDS.opportunities.salesRep]: [salesRepId]
        }
      })
    });

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Error updating opportunity sales rep:', error);
    return jsonResponse({ success: false, error: 'Failed to update sales rep' }, 500);
  }
}

// ─── Airtable Save (Create Quote + Update/Create Contact/Opportunity) ──────────
async function handleAirtableSave(env, quoteData, quoteNumber, quoteId, existingAirtableQuoteId) {
  let airtableOpportunityId = quoteData.airtableOpportunityId;
  let airtableContactId = quoteData.airtableContactId;
  let airtableQuoteId = null;

  // ── Flow B: Manual entry — create Contact and Opportunity first ──
  if (!airtableOpportunityId) {
    // Split customer name into first/last
    const nameParts = (quoteData.customerName || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create Contact
    const contactFields = {
      [AT_FIELDS.contacts.firstName]: firstName,
      [AT_FIELDS.contacts.lastName]: lastName
    };
    // Only set non-empty fields to avoid blanking
    if (quoteData.customerEmail) contactFields[AT_FIELDS.contacts.email] = quoteData.customerEmail;
    if (quoteData.customerPhone) contactFields[AT_FIELDS.contacts.phone] = quoteData.customerPhone;
    if (quoteData.streetAddress) contactFields[AT_FIELDS.contacts.streetAddress] = quoteData.streetAddress;
    if (quoteData.city) contactFields[AT_FIELDS.contacts.city] = quoteData.city;
    if (quoteData.state) contactFields[AT_FIELDS.contacts.state] = quoteData.state;
    if (quoteData.zipCode) contactFields[AT_FIELDS.contacts.zipCode] = quoteData.zipCode;
    if (quoteData.companyName) contactFields[AT_FIELDS.contacts.companyName] = quoteData.companyName;

    const contactResult = await airtableFetch(env, `/${AT_TABLES.contacts}`, {
      method: 'POST',
      body: JSON.stringify({ fields: contactFields })
    });
    airtableContactId = contactResult.id;

    // Create Opportunity linked to new Contact
    const oppResult = await airtableFetch(env, `/${AT_TABLES.opportunities}`, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          [AT_FIELDS.opportunities.contacts]: [airtableContactId],
          [AT_FIELDS.opportunities.status]: 'Estimate Sent',
          [AT_FIELDS.opportunities.dateTime]: new Date().toISOString()
        }
      })
    });
    airtableOpportunityId = oppResult.id;
  }

  // ── Create or update Quote record in Airtable ──
  const quoteFields = {
    [AT_FIELDS.quotes.opportunity]: [airtableOpportunityId],
    [AT_FIELDS.quotes.totalAmount]: quoteData.orderTotalPrice || 0,
    [AT_FIELDS.quotes.date]: new Date().toISOString().split('T')[0],
    [AT_FIELDS.quotes.quoteType]: 'Formal',
    [AT_FIELDS.quotes.quoteNumber]: quoteNumber,
    [AT_FIELDS.quotes.status]: 'Sent',
    [AT_FIELDS.quotes.type]: 'In-Person Estimate',
    [AT_FIELDS.quotes.quoteCheckbox]: true,
    [AT_FIELDS.quotes.notes]: buildQuoteNotes(quoteData)
  };

  if (existingAirtableQuoteId) {
    // PATCH existing Quote record instead of creating a duplicate
    const quoteResult = await airtableFetch(env, `/${AT_TABLES.quotes}/${existingAirtableQuoteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: quoteFields })
    });
    airtableQuoteId = quoteResult.id;
  } else {
    // Create new Quote record
    const quoteResult = await airtableFetch(env, `/${AT_TABLES.quotes}`, {
      method: 'POST',
      body: JSON.stringify({ fields: quoteFields })
    });
    airtableQuoteId = quoteResult.id;
  }

  // ── Update Contact (sync-back editable fields) ──
  // Only if we have a Contact ID and there was an existing opportunity
  // (for manual entry, Contact was already created with current data above)
  if (airtableContactId && quoteData.airtableOpportunityId) {
    const updateFields = {};

    // Split customer name into first/last for Airtable
    if (quoteData.customerName) {
      const nameParts = quoteData.customerName.trim().split(/\s+/);
      updateFields[AT_FIELDS.contacts.firstName] = nameParts[0] || '';
      updateFields[AT_FIELDS.contacts.lastName] = nameParts.slice(1).join(' ') || '';
    }

    if (quoteData.streetAddress) updateFields[AT_FIELDS.contacts.streetAddress] = quoteData.streetAddress;
    if (quoteData.city) updateFields[AT_FIELDS.contacts.city] = quoteData.city;
    if (quoteData.state) updateFields[AT_FIELDS.contacts.state] = quoteData.state;
    if (quoteData.zipCode) updateFields[AT_FIELDS.contacts.zipCode] = quoteData.zipCode;
    if (quoteData.customerEmail) updateFields[AT_FIELDS.contacts.email] = quoteData.customerEmail;
    if (quoteData.customerPhone) updateFields[AT_FIELDS.contacts.phone] = quoteData.customerPhone;
    if (quoteData.companyName) updateFields[AT_FIELDS.contacts.companyName] = quoteData.companyName;

    if (Object.keys(updateFields).length > 0) {
      await airtableFetch(env, `/${AT_TABLES.contacts}/${airtableContactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: updateFields })
      });
    }
  }

  // ── Update D1 with Airtable record IDs ──
  await env.DB.prepare(`
    UPDATE quotes SET
      airtable_opportunity_id = ?,
      airtable_contact_id = ?,
      airtable_quote_id = ?
    WHERE id = ?
  `).bind(airtableOpportunityId, airtableContactId, airtableQuoteId, quoteId).run();

  return {
    success: true,
    airtableQuoteId,
    airtableOpportunityId,
    airtableContactId
  };
}

// ─── Email Handler ─────────────────────────────────────────────────────────────
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

// ─── Save Quote (D1 + Airtable dual write) ─────────────────────────────────────
async function handleSaveQuote(request, env) {
  try {
    const quoteData = await request.json();

    // Validate required fields
    if (!quoteData.customerName || !quoteData.screens) {
      return jsonResponse({ error: 'Missing required quote data' }, 400);
    }

    const quoteId = quoteData.id || Date.now().toString();
    const timestamp = new Date().toISOString();

    // Check if this quote already has an Airtable Quote record (idempotency)
    // Must happen BEFORE INSERT OR REPLACE which resets airtable_quote_id to null
    let existingAirtableQuoteId = null;
    try {
      const existingRow = await env.DB.prepare(
        'SELECT airtable_quote_id, quote_number FROM quotes WHERE id = ?'
      ).bind(quoteId).first();
      if (existingRow && existingRow.airtable_quote_id) {
        existingAirtableQuoteId = existingRow.airtable_quote_id;
      }
    } catch (lookupErr) {
      console.error('Error checking existing Airtable quote ID:', lookupErr);
    }

    // Generate quote number
    let quoteNumber = null;
    try {
      quoteNumber = await generateQuoteNumber(env);
    } catch (qnError) {
      console.error('Error generating quote number:', qnError);
      // Fallback: use timestamp-based number
      quoteNumber = `Q${timestamp.slice(2, 4)}${timestamp.slice(5, 7)}-${Date.now().toString().slice(-3)}`;
    }

    // Store quote number on the data object for the Airtable notes builder
    quoteData.quoteNumber = quoteNumber;

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
        updated_at,
        airtable_opportunity_id,
        airtable_contact_id,
        airtable_quote_id,
        quote_number,
        internal_comments
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      timestamp,
      quoteData.airtableOpportunityId || null,
      quoteData.airtableContactId || null,
      null,
      quoteNumber,
      quoteData.internalComments || null
    ).run();

    // Attempt Airtable sync (non-fatal if it fails)
    let airtableSync = false;
    let airtableSyncError = null;

    try {
      const atResult = await handleAirtableSave(env, quoteData, quoteNumber, quoteId, existingAirtableQuoteId);
      airtableSync = atResult.success;
    } catch (atError) {
      console.error('Airtable sync failed:', atError);
      airtableSyncError = atError.message || 'Airtable sync failed';
    }

    return jsonResponse({
      success: true,
      quoteId: quoteId,
      quoteNumber: quoteNumber,
      airtableSync: airtableSync,
      airtableSyncError: airtableSyncError,
      message: airtableSync ? 'Quote saved successfully' : 'Quote saved (Airtable sync failed)'
    });

  } catch (error) {
    console.error('Error in handleSaveQuote:', error);
    return jsonResponse({
      success: false,
      error: error.message
    }, 500);
  }
}

// ─── Get All Quotes ────────────────────────────────────────────────────────────
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
        quote_number,
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

// ─── Get Specific Quote ────────────────────────────────────────────────────────
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

// ─── Delete Specific Quote ─────────────────────────────────────────────────────
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

// ─── JSON Response Helper ──────────────────────────────────────────────────────
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
