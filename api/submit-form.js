// Receives every form submission on the site (see wireBackendForm in
// assets/custom/sticky-nav.js) and relays it through Sender.net two ways:
// a transactional notification email to the site owner's inbox (the part
// visitors' messages actually depend on arriving), and a best-effort
// subscriber signup tagged by which form it came from (for the
// segmentation/automation work planned on top of this later). Runs as a
// Vercel serverless function so the Sender API key never reaches the
// browser -- this static site has no other backend.
//
// Required environment variables (Vercel project settings, not this file):
//   SENDER_API_KEY      Sender.net API access token (Settings > API access tokens)
//   SENDER_FROM_EMAIL   A sending address verified in Sender
//   CONTACT_NOTIFY_EMAIL  Where notification emails should land (the Zoho inbox)
// Optional:
//   SENDER_FROM_NAME    Defaults to "DemCon Website" if unset
//   SENDER_GROUP_*      Sender group/list ID per form type (see FORM_CONFIGS below) --
//                       omit any of these and that form's subscriber just won't be
//                       added to a group, the notification email still sends fine.

var SENDER_API_BASE = 'https://api.sender.net/v2';

var FORM_CONFIGS = {
  contact: { subject: 'New message from thedemcon.org contact form', groupEnvVar: 'SENDER_GROUP_CONTACT' },
  newsletter: { subject: 'New newsletter signup — thedemcon.org', groupEnvVar: 'SENDER_GROUP_NEWSLETTER' },
  joinus: { subject: 'New "Join Us" signup — thedemcon.org', groupEnvVar: 'SENDER_GROUP_JOINUS' },
  salon: { subject: 'New Salon notify-me signup — thedemcon.org', groupEnvVar: 'SENDER_GROUP_SALON' },
  register: { subject: 'New registration interest — thedemcon.org', groupEnvVar: 'SENDER_GROUP_REGISTER' },
  propose: { subject: 'New Salon session proposal — thedemcon.org', groupEnvVar: 'SENDER_GROUP_PROPOSE' },
  apply: { subject: 'New speaker application — thedemcon.org', groupEnvVar: 'SENDER_GROUP_APPLY' },
  partner: { subject: 'New partnership inquiry — thedemcon.org', groupEnvVar: 'SENDER_GROUP_PARTNER' }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  var body = req.body || {};
  var formType = body.formType;
  var fields = body.fields;
  var page = body.page;

  var config = FORM_CONFIGS[formType];
  if (!config || !fields || typeof fields.Email !== 'string' || !fields.Email.trim()) {
    res.status(400).json({ ok: false, error: 'Invalid submission' });
    return;
  }

  var apiKey = process.env.SENDER_API_KEY;
  var notifyEmail = process.env.CONTACT_NOTIFY_EMAIL;
  var fromEmail = process.env.SENDER_FROM_EMAIL;
  var fromName = process.env.SENDER_FROM_NAME || 'DemCon Website';

  if (!apiKey || !notifyEmail || !fromEmail) {
    console.error('submit-form: missing SENDER_API_KEY, CONTACT_NOTIFY_EMAIL, or SENDER_FROM_EMAIL env vars');
    res.status(500).json({ ok: false, error: 'Form submission is not configured yet' });
    return;
  }

  var entries = Object.keys(fields)
    .filter(function (key) {
      var value = fields[key];
      return value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && !value.length);
    })
    .map(function (key) {
      var value = fields[key];
      return { key: key, value: Array.isArray(value) ? value.join(', ') : value };
    });

  var textLines = ['Form: ' + formType, 'Page: ' + (page || 'unknown'), ''].concat(
    entries.map(function (e) { return e.key + ': ' + e.value; })
  );
  var htmlRows = entries
    .map(function (e) { return '<tr><td><strong>' + escapeHtml(e.key) + '</strong></td><td>' + escapeHtml(e.value) + '</td></tr>'; })
    .join('');
  var html =
    '<p>Form: ' + escapeHtml(formType) + '<br>Page: ' + escapeHtml(page || 'unknown') + '</p>' +
    '<table cellpadding="6" cellspacing="0">' + htmlRows + '</table>';

  var notified = false;
  try {
    var sendRes = await fetch(SENDER_API_BASE + '/message/send', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        from: { email: fromEmail, name: fromName },
        to: { email: notifyEmail },
        subject: config.subject,
        text: textLines.join('\n'),
        html: html
      })
    });
    notified = sendRes.ok;
    if (!sendRes.ok) {
      console.error('Sender transactional email failed', sendRes.status, await sendRes.text());
    }
  } catch (err) {
    console.error('Sender transactional email error', err);
  }

  // Best-effort subscriber capture -- a failure here shouldn't fail the
  // whole request, since the notification email above is the part the
  // site owner actually depends on arriving.
  try {
    var nameSource = fields.Name || fields['Full Name'] || '';
    var nameParts = String(nameSource).trim().split(/\s+/).filter(Boolean);
    var groupId = config.groupEnvVar && process.env[config.groupEnvVar];
    var subscriberBody = {
      email: fields.Email.trim(),
      firstname: nameParts[0],
      lastname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined
    };
    if (groupId) subscriberBody.groups = [groupId];

    await fetch(SENDER_API_BASE + '/subscribers', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(subscriberBody)
    });
  } catch (err) {
    console.error('Sender subscriber capture error', err);
  }

  if (!notified) {
    res.status(502).json({ ok: false, error: 'Could not send notification email' });
    return;
  }

  res.status(200).json({ ok: true });
};
