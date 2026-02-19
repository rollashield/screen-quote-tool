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

    // Route: Payment info (static payment instructions)
    if (url.pathname === '/api/payment-info' && request.method === 'GET') {
      return await handleGetPaymentInfo(env);
    }

    // Route: Create Stripe eCheck checkout session
    if (url.pathname.match(/^\/api\/quote\/[^/]+\/create-echeck-session$/) && request.method === 'POST') {
      const quoteId = url.pathname.split('/')[3];
      return await handleCreateEcheckSession(quoteId, env);
    }

    // Route: Send quote for remote signature (must come before generic /api/quote/ GET)
    if (url.pathname.match(/^\/api\/quote\/[^/]+\/send-for-signature$/) && request.method === 'POST') {
      const quoteId = url.pathname.split('/')[3];
      return await handleSendForSignature(quoteId, request, env);
    }

    // Route: Customer view of quote (stripped of internal data)
    if (url.pathname.match(/^\/api\/quote\/[^/]+\/customer-view$/) && request.method === 'GET') {
      const quoteId = url.pathname.split('/')[3];
      return await handleCustomerView(quoteId, env);
    }

    // Route: In-person signature submission
    if (url.pathname.match(/^\/api\/quote\/[^/]+\/sign-in-person$/) && request.method === 'POST') {
      const quoteId = url.pathname.split('/')[3];
      return await handleSignInPerson(quoteId, request, env);
    }

    // Route: Remote signing - GET (validate token, return quote data)
    if (url.pathname.match(/^\/api\/sign\/[^/]+$/) && request.method === 'GET') {
      const token = url.pathname.split('/')[3];
      return await handleGetSigningPage(token, env);
    }

    // Route: Remote signing - POST (submit signature)
    if (url.pathname.match(/^\/api\/sign\/[^/]+$/) && request.method === 'POST') {
      const token = url.pathname.split('/')[3];
      return await handleSubmitRemoteSignature(token, request, env);
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

    // Route: Serve photo from R2
    if (url.pathname.startsWith('/r2/quotes/') && request.method === 'GET') {
      return await handleServePhoto(url.pathname.slice(4), env); // strip "/r2/" prefix
    }

    // Route: Upload photo to R2
    if (url.pathname === '/api/photos/upload' && request.method === 'POST') {
      return await handlePhotoUpload(request, env);
    }

    // Route: Delete photo from R2
    if (url.pathname === '/api/photos/delete' && request.method === 'POST') {
      return await handlePhotoDelete(request, env);
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

// ─── Photo Serve (R2) ───────────────────────────────────────────────────────
async function handleServePhoto(key, env) {
  if (!env.PHOTO_BUCKET) {
    return new Response('Photo storage not configured', { status: 500 });
  }

  const object = await env.PHOTO_BUCKET.get(key);
  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ─── Photo Upload (R2) ──────────────────────────────────────────────────────
async function handlePhotoUpload(request, env) {
  try {
    if (!env.PHOTO_BUCKET) {
      return jsonResponse({ error: 'Photo storage is not configured' }, 500);
    }

    const formData = await request.formData();
    const photo = formData.get('photo');
    const quoteId = formData.get('quoteId');
    const screenIndex = formData.get('screenIndex');

    if (!photo || !quoteId || screenIndex === null) {
      return jsonResponse({ error: 'photo, quoteId, and screenIndex are required' }, 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
    if (!allowedTypes.includes(photo.type)) {
      return jsonResponse({ error: 'Only JPEG, PNG, and HEIC images are allowed' }, 400);
    }

    // Validate file size (5MB max — photos are compressed client-side)
    if (photo.size > 5 * 1024 * 1024) {
      return jsonResponse({ error: 'Photo must be under 5MB' }, 400);
    }

    // Generate unique R2 key
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const ext = photo.type === 'image/png' ? 'png' : 'jpg';
    const key = `quotes/${quoteId}/screens/${screenIndex}/${timestamp}-${randomId}.${ext}`;

    // Upload to R2
    await env.PHOTO_BUCKET.put(key, photo.stream(), {
      httpMetadata: { contentType: photo.type },
      customMetadata: { quoteId, screenIndex: String(screenIndex), originalName: photo.name }
    });

    return jsonResponse({
      success: true,
      photo: {
        key,
        filename: photo.name,
        size: photo.size,
        contentType: photo.type
      }
    });
  } catch (error) {
    console.error('Error in handlePhotoUpload:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// ─── Photo Delete (R2) ──────────────────────────────────────────────────────
async function handlePhotoDelete(request, env) {
  try {
    if (!env.PHOTO_BUCKET) {
      return jsonResponse({ error: 'Photo storage is not configured' }, 500);
    }

    const body = await request.json();
    const { key } = body;

    if (!key) {
      return jsonResponse({ error: 'key is required' }, 400);
    }

    // Validate key format to prevent arbitrary deletion
    if (!key.startsWith('quotes/')) {
      return jsonResponse({ error: 'Invalid photo key' }, 400);
    }

    await env.PHOTO_BUCKET.delete(key);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Error in handlePhotoDelete:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

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
        from: emailData.from || 'Roll-A-Shield <noreply@updates.rollashield.com>',
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

    // Check if this quote already exists (preserve Airtable ID + signature/payment data)
    // Must happen BEFORE INSERT OR REPLACE which resets columns to null
    let existingAirtableQuoteId = null;
    let existingSignatureData = {};
    try {
      const existingRow = await env.DB.prepare(
        `SELECT airtable_quote_id, quote_number,
                quote_status, signing_token, signing_token_expires_at,
                signature_data, signed_at, signer_name, signer_ip,
                signing_method, signature_sent_at,
                payment_status, payment_method, payment_amount, payment_date,
                clover_payment_link, stripe_payment_intent_id, clover_checkout_id
         FROM quotes WHERE id = ?`
      ).bind(quoteId).first();
      if (existingRow) {
        if (existingRow.airtable_quote_id) {
          existingAirtableQuoteId = existingRow.airtable_quote_id;
        }
        existingSignatureData = {
          quote_status: existingRow.quote_status || 'draft',
          signing_token: existingRow.signing_token,
          signing_token_expires_at: existingRow.signing_token_expires_at,
          signature_data: existingRow.signature_data,
          signed_at: existingRow.signed_at,
          signer_name: existingRow.signer_name,
          signer_ip: existingRow.signer_ip,
          signing_method: existingRow.signing_method,
          signature_sent_at: existingRow.signature_sent_at,
          payment_status: existingRow.payment_status || 'unpaid',
          payment_method: existingRow.payment_method,
          payment_amount: existingRow.payment_amount,
          payment_date: existingRow.payment_date,
          clover_payment_link: existingRow.clover_payment_link,
          stripe_payment_intent_id: existingRow.stripe_payment_intent_id,
          clover_checkout_id: existingRow.clover_checkout_id,
        };
      }
    } catch (lookupErr) {
      console.error('Error checking existing quote data:', lookupErr);
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

    // Insert into D1 database (preserving signature/payment columns on re-save)
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
        internal_comments,
        quote_status,
        signing_token,
        signing_token_expires_at,
        signature_data,
        signed_at,
        signer_name,
        signer_ip,
        signing_method,
        signature_sent_at,
        payment_status,
        payment_method,
        payment_amount,
        payment_date,
        clover_payment_link,
        stripe_payment_intent_id,
        clover_checkout_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      quoteData.internalComments || null,
      existingSignatureData.quote_status || 'draft',
      existingSignatureData.signing_token || null,
      existingSignatureData.signing_token_expires_at || null,
      existingSignatureData.signature_data || null,
      existingSignatureData.signed_at || null,
      existingSignatureData.signer_name || null,
      existingSignatureData.signer_ip || null,
      existingSignatureData.signing_method || null,
      existingSignatureData.signature_sent_at || null,
      existingSignatureData.payment_status || 'unpaid',
      existingSignatureData.payment_method || null,
      existingSignatureData.payment_amount || null,
      existingSignatureData.payment_date || null,
      existingSignatureData.clover_payment_link || null,
      existingSignatureData.stripe_payment_intent_id || null,
      existingSignatureData.clover_checkout_id || null
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

    // Parse the full quote data and include metadata from D1 columns
    const quoteData = JSON.parse(result.quote_data);
    quoteData.quoteNumber = result.quote_number || null;
    quoteData.quote_status = result.quote_status || 'draft';
    quoteData.payment_status = result.payment_status || 'unpaid';

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

// ─── Data Stripping Helper ────────────────────────────────────────────────────
// Removes internal cost/margin data from quote_data before sending to customers
function stripInternalData(quoteData) {
  const stripped = JSON.parse(JSON.stringify(quoteData));
  delete stripped.orderTotalCost;
  delete stripped.orderTotalInstallationCost;
  delete stripped.totalProfit;
  delete stripped.marginPercent;
  delete stripped.totalScreenCosts;
  delete stripped.totalMotorCosts;
  delete stripped.totalAccessoriesCosts;
  delete stripped.totalCableSurcharge;
  delete stripped.internalComments;
  if (stripped.screens) {
    stripped.screens.forEach(screen => {
      delete screen.screenCostOnly;
      delete screen.motorCost;
      delete screen.installationCost;
      delete screen.totalCost;
    });
  }
  return stripped;
}

// ─── Token Generation Helper ─────────────────────────────────────────────────
function generateSigningToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Send Quote for Remote Signature ─────────────────────────────────────────
async function handleSendForSignature(quoteId, request, env) {
  try {
    const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
    if (!row) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    const quoteData = JSON.parse(row.quote_data);
    const customerEmail = quoteData.customerEmail || row.customer_email;

    if (!customerEmail) {
      return jsonResponse({ error: 'Customer email is required to send for signature' }, 400);
    }

    // Generate signing token and expiry (30 days)
    const token = generateSigningToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const sentAt = new Date().toISOString();

    // Update D1 with token and status
    await env.DB.prepare(`
      UPDATE quotes SET
        signing_token = ?,
        signing_token_expires_at = ?,
        signature_sent_at = ?,
        quote_status = CASE WHEN quote_status = 'draft' THEN 'sent' ELSE quote_status END,
        updated_at = ?
      WHERE id = ?
    `).bind(token, expiresAt, sentAt, sentAt, quoteId).run();

    // Build signing URL (GitHub Pages base)
    const signingUrl = `https://rollashield.github.io/screen-quote-tool/sign.html?token=${token}`;

    // Build and send email via Resend
    const customerName = quoteData.customerName || row.customer_name || 'Customer';
    const quoteNumber = row.quote_number || 'Quote';
    const totalPrice = quoteData.orderTotalPrice || row.total_price || 0;
    const depositAmount = totalPrice / 2;
    const screenCount = quoteData.screens?.length || row.screen_count || 0;
    const salesRepName = quoteData.salesRepName || 'Roll-A-Shield';
    const salesRepEmail = quoteData.salesRepEmail || '';
    const salesRepPhone = quoteData.salesRepPhone || '(480) 921-0200';

    const htmlEmail = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #004a95 0%, #0071bc 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Roll-A-Shield</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Your Quote is Ready for Review</p>
        </div>
        <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <p>Dear ${customerName},</p>
          <p>Your custom rolling screen quote is ready for your review and signature.</p>
          <div style="background: #f0f4f8; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Quote:</strong> ${quoteNumber}</p>
            <p style="margin: 5px 0;"><strong>Screens:</strong> ${screenCount}</p>
            <p style="margin: 5px 0;"><strong>Total:</strong> $${totalPrice.toFixed(2)}</p>
            <p style="margin: 5px 0;"><strong>Deposit (50%):</strong> $${depositAmount.toFixed(2)}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${signingUrl}" style="background: #004a95; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; display: inline-block;">Review &amp; Sign Your Quote</a>
          </div>
          <p style="color: #666; font-size: 13px;">This link is valid for 30 days. If you have questions, contact ${salesRepName} at ${salesRepPhone}${salesRepEmail ? ` or ${salesRepEmail}` : ''}.</p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
          <p>Roll-A-Shield | Custom Rolling Screens | (480) 921-0200</p>
        </div>
      </div>
    `;

    const textEmail = `Dear ${customerName},\n\nYour custom rolling screen quote (${quoteNumber}) is ready for review and signature.\n\nTotal: $${totalPrice.toFixed(2)}\nDeposit (50%): $${depositAmount.toFixed(2)}\n\nReview and sign here: ${signingUrl}\n\nThis link is valid for 30 days.\n\nRoll-A-Shield\n(480) 921-0200`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Roll-A-Shield Quotes <noreply@updates.rollashield.com>',
        to: [customerEmail],
        cc: salesRepEmail ? [salesRepEmail] : [],
        subject: `Review & Sign Your Roll-A-Shield Quote - ${quoteNumber}`,
        html: htmlEmail,
        text: textEmail
      })
    });

    return jsonResponse({
      success: true,
      message: `Signing link sent to ${customerEmail}`,
      signingUrl: signingUrl
    });
  } catch (error) {
    console.error('Error in handleSendForSignature:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// ─── Customer View (Stripped Quote Data) ─────────────────────────────────────
async function handleCustomerView(quoteId, env) {
  try {
    const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
    if (!row) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    const quoteData = JSON.parse(row.quote_data);
    const stripped = stripInternalData(quoteData);

    return jsonResponse({
      success: true,
      quote: stripped,
      quoteNumber: row.quote_number,
      quoteStatus: row.quote_status || 'draft',
      alreadySigned: row.quote_status === 'signed',
      signedAt: row.signed_at,
      signerName: row.signer_name,
      signatureData: row.signature_data
    });
  } catch (error) {
    console.error('Error in handleCustomerView:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// ─── Remote Signing: GET (Validate Token, Return Quote) ──────────────────────
async function handleGetSigningPage(token, env) {
  try {
    const row = await env.DB.prepare(
      'SELECT * FROM quotes WHERE signing_token = ?'
    ).bind(token).first();

    if (!row) {
      return jsonResponse({ error: 'Invalid signing link' }, 404);
    }

    // Check expiry
    if (row.signing_token_expires_at && new Date(row.signing_token_expires_at) < new Date()) {
      return jsonResponse({ error: 'This signing link has expired. Please contact your sales representative for a new link.' }, 410);
    }

    const quoteData = JSON.parse(row.quote_data);
    const stripped = stripInternalData(quoteData);

    // If already signed, return read-only with signature
    if (row.quote_status === 'signed' || row.quote_status === 'finalized') {
      return jsonResponse({
        success: true,
        quote: stripped,
        quoteId: row.id,
        quoteNumber: row.quote_number,
        quoteStatus: row.quote_status,
        alreadySigned: true,
        signedAt: row.signed_at,
        signerName: row.signer_name,
        signatureData: row.signature_data
      });
    }

    // Mark as viewed if still just sent
    if (row.quote_status === 'sent') {
      await env.DB.prepare(
        "UPDATE quotes SET quote_status = 'viewed', updated_at = ? WHERE id = ?"
      ).bind(new Date().toISOString(), row.id).run();
    }

    return jsonResponse({
      success: true,
      quote: stripped,
      quoteId: row.id,
      quoteNumber: row.quote_number,
      quoteStatus: 'viewed',
      alreadySigned: false
    });
  } catch (error) {
    console.error('Error in handleGetSigningPage:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// ─── Remote Signing: POST (Submit Signature) ─────────────────────────────────
async function handleSubmitRemoteSignature(token, request, env) {
  try {
    const row = await env.DB.prepare(
      'SELECT * FROM quotes WHERE signing_token = ?'
    ).bind(token).first();

    if (!row) {
      return jsonResponse({ error: 'Invalid signing link' }, 404);
    }

    // Check expiry
    if (row.signing_token_expires_at && new Date(row.signing_token_expires_at) < new Date()) {
      return jsonResponse({ error: 'This signing link has expired' }, 410);
    }

    // Check if already signed
    if (row.quote_status === 'signed' || row.quote_status === 'finalized') {
      return jsonResponse({ error: 'This quote has already been signed' }, 409);
    }

    const body = await request.json();
    const { signatureData, signerName } = body;

    if (!signatureData || !signerName) {
      return jsonResponse({ error: 'Signature and name are required' }, 400);
    }

    const signerIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const signedAt = new Date().toISOString();

    // Update D1 with signature
    await env.DB.prepare(`
      UPDATE quotes SET
        signature_data = ?,
        signer_name = ?,
        signer_ip = ?,
        signed_at = ?,
        signing_method = 'remote',
        quote_status = 'signed',
        updated_at = ?
      WHERE id = ?
    `).bind(signatureData, signerName, signerIp, signedAt, signedAt, row.id).run();

    // Send confirmation email to sales rep (non-fatal)
    try {
      const quoteData = JSON.parse(row.quote_data);
      const salesRepEmail = quoteData.salesRepEmail;
      const customerName = quoteData.customerName || row.customer_name;

      if (salesRepEmail) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Roll-A-Shield Quotes <noreply@updates.rollashield.com>',
            to: [salesRepEmail],
            subject: `${customerName} has signed Quote ${row.quote_number}`,
            html: `<p><strong>${customerName}</strong> has signed quote <strong>${row.quote_number}</strong>.</p><p><strong>Signed:</strong> ${new Date(signedAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' })}</p><p><strong>Method:</strong> Remote (email link)</p><p><strong>Signer name:</strong> ${signerName}</p>`,
            text: `${customerName} has signed quote ${row.quote_number}.\nSigned: ${signedAt}\nMethod: Remote\nSigner: ${signerName}`
          })
        });
      }
    } catch (emailError) {
      console.error('Failed to send signature confirmation email:', emailError);
    }

    // Update Airtable quote status to "Accepted" (non-fatal)
    if (row.airtable_quote_id) {
      try {
        await airtableFetch(env, `/${AT_TABLES.quotes}/${row.airtable_quote_id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fields: { [AT_FIELDS.quotes.status]: 'Accepted' }
          })
        });
      } catch (atError) {
        console.error('Failed to update Airtable quote status:', atError);
      }
    }

    return jsonResponse({
      success: true,
      quoteId: row.id,
      message: 'Quote signed successfully'
    });
  } catch (error) {
    console.error('Error in handleSubmitRemoteSignature:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// ─── In-Person Signature Submission ──────────────────────────────────────────
async function handleSignInPerson(quoteId, request, env) {
  try {
    const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
    if (!row) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    // Check if already signed
    if (row.quote_status === 'signed' || row.quote_status === 'finalized') {
      return jsonResponse({ error: 'This quote has already been signed' }, 409);
    }

    const body = await request.json();
    const { signatureData, signerName } = body;

    if (!signatureData || !signerName) {
      return jsonResponse({ error: 'Signature and name are required' }, 400);
    }

    const signerIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const signedAt = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE quotes SET
        signature_data = ?,
        signer_name = ?,
        signer_ip = ?,
        signed_at = ?,
        signing_method = 'in-person',
        quote_status = 'signed',
        updated_at = ?
      WHERE id = ?
    `).bind(signatureData, signerName, signerIp, signedAt, signedAt, quoteId).run();

    // Update Airtable quote status to "Accepted" (non-fatal)
    if (row.airtable_quote_id) {
      try {
        await airtableFetch(env, `/${AT_TABLES.quotes}/${row.airtable_quote_id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fields: { [AT_FIELDS.quotes.status]: 'Accepted' }
          })
        });
      } catch (atError) {
        console.error('Failed to update Airtable quote status:', atError);
      }
    }

    return jsonResponse({
      success: true,
      quoteId: quoteId,
      message: 'Quote signed successfully'
    });
  } catch (error) {
    console.error('Error in handleSignInPerson:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// ─── Payment Info (Static Config) ────────────────────────────────────────────
async function handleGetPaymentInfo(env) {
  return jsonResponse({
    success: true,
    paymentInfo: {
      ach: {
        bank: env.PAYMENT_ACH_BANK || 'Zions Bancorporation DBA National Bank of Arizona',
        accountHolder: env.PAYMENT_ACH_HOLDER || 'Roll A Shield, LLC',
        routing: env.PAYMENT_ACH_ROUTING || '',
        account: env.PAYMENT_ACH_ACCOUNT || ''
      },
      check: {
        payableTo: 'Roll-A-Shield',
        address: env.PAYMENT_CHECK_ADDRESS || '2680 S. Industrial Park Ave, Tempe, AZ 85282',
        warning: 'Paying by check may cause delays in releasing your order.'
      },
      zelle: {
        username: env.PAYMENT_ZELLE_USERNAME || 'ap@rollashield.com',
        limitNote: 'Typically $2.5-3.5k max, depending on your bank'
      },
      clover: {
        permanentPaymentLink: 'https://link.clover.com/urlshortener/rbRB6n',
        creditCardFee: '3% processing fee applies to credit card payments',
        debitCardFee: 'No fee for debit card payments'
      }
    }
  });
}

// ─── Stripe eCheck (ACH) Checkout Session ───────────────────────────────────
async function handleCreateEcheckSession(quoteId, env) {
  try {
    if (!env.STRIPE_SECRET_KEY) {
      return jsonResponse({ error: 'Stripe is not configured' }, 500);
    }

    const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
    if (!row) {
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    const quoteData = JSON.parse(row.quote_data);
    const totalPrice = quoteData.orderTotalPrice || 0;
    const depositAmount = Math.round((totalPrice / 2) * 100); // cents

    if (depositAmount <= 0) {
      return jsonResponse({ error: 'Invalid deposit amount' }, 400);
    }

    const customerName = quoteData.customerName || 'Customer';
    const customerEmail = quoteData.customerEmail || '';
    const quoteNumber = row.quote_number || 'Quote';
    const baseUrl = 'https://rollashield.github.io/screen-quote-tool';

    // Create or find Stripe Customer so name + email are pre-populated at checkout
    let stripeCustomerId = null;
    if (customerName || customerEmail) {
      const custParams = new URLSearchParams();
      if (customerName) custParams.append('name', customerName);
      if (customerEmail) custParams.append('email', customerEmail);
      custParams.append('metadata[quoteId]', quoteId);
      custParams.append('metadata[quoteNumber]', quoteNumber);

      const custResponse = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: custParams.toString()
      });

      if (custResponse.ok) {
        const customer = await custResponse.json();
        stripeCustomerId = customer.id;
      }
    }

    // Create Stripe Checkout Session with us_bank_account only
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('payment_method_types[0]', 'us_bank_account');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][product_data][name]', `Roll-A-Shield Deposit — ${quoteNumber}`);
    params.append('line_items[0][price_data][unit_amount]', depositAmount.toString());
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', `${baseUrl}/pay.html?quoteId=${quoteId}&payment=success`);
    params.append('cancel_url', `${baseUrl}/pay.html?quoteId=${quoteId}&payment=cancelled`);
    params.append('payment_intent_data[description]', `Deposit for ${quoteNumber} — ${customerName}`);
    params.append('payment_intent_data[metadata][quoteId]', quoteId);
    params.append('payment_intent_data[metadata][quoteNumber]', quoteNumber);

    if (stripeCustomerId) {
      params.append('customer', stripeCustomerId);
    } else if (customerEmail) {
      params.append('customer_email', customerEmail);
    }

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await response.json();

    if (!response.ok) {
      console.error('Stripe error:', JSON.stringify(session));
      return jsonResponse({ error: session.error?.message || 'Failed to create checkout session' }, 500);
    }

    return jsonResponse({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error creating eCheck session:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
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
