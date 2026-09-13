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
//   MAILERLITE_API_KEY  The Parlor Magazine's newsletter lives on MailerLite, not
//                       Sender, so the opt-in on the salon form is a second call
//                       to a second provider. Unset, the tick is still recorded
//                       in the notification email but puts them on no list.
//   MAILERLITE_GROUP_PARLOR
//                       The MailerLite group id for that newsletter. Optional:
//                       without it the subscriber is still created, just not
//                       filed into a group.
//   SALON_JOIN_URL      The Zoom link for the current salon. Deliberately an
//                       environment variable and not a field in salon.json:
//                       that file is served to anyone who opens the site, and
//                       a Zoom link carrying a pwd token is a key to the room.
//                       Unset, registrants still get their confirmation --
//                       with the joining line left out rather than empty.

var SENDER_API_BASE = 'https://api.sender.net/v2';
var MAILERLITE_API_BASE = 'https://connect.mailerlite.com/api';

// The same file the salons page fills its hero from, so a registrant is
// told exactly what the page advertised. Editing it changes both.
var SALON = require('../assets/salons/salon.json');

// Which forms mean "I am coming to the salon", and so earn a confirmation
// with the joining details. Every other form on the site is a message or an
// expression of interest, and gets the notification email only.
var SALON_FORMS = { salon: true, register: true };

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

// The confirmation the registrant receives. Plain text and HTML both, with
// the HTML kept to inline styles and a table-free layout -- mail clients are
// not browsers, and this has to survive Outlook as well as Gmail.
function salonConfirmation(firstName, joinUrl) {
  var when = [SALON.date, SALON.time].filter(Boolean).join(', ');
  var greeting = firstName ? 'Hi ' + firstName + ',' : 'Hi,';

  var lines = [
    greeting,
    '',
    'You are registered for Democracy Salons — ' + SALON.topic + '.',
    '',
    'When:  ' + when,
    'Where: ' + (SALON.mode || 'Online')
  ];
  if (joinUrl) lines.push('', 'Join here: ' + joinUrl);
  lines.push('', 'See you there.', '— DemCon × The Parlor');

  var joinBlock = joinUrl
    ? '<p style="margin:0 0 28px"><a href="' + escapeHtml(joinUrl) + '"' +
      ' style="display:inline-block;background:#fcf424;color:#1b1514;font-family:Helvetica,Arial,sans-serif;' +
      'font-weight:700;font-size:15px;letter-spacing:0.06em;text-transform:uppercase;' +
      'text-decoration:none;padding:14px 26px;border:2px solid #1b1514">Join the salon</a></p>' +
      '<p style="margin:0 0 28px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#6b6763">' +
      'Or paste this into your browser:<br>' + escapeHtml(joinUrl) + '</p>'
    : '';

  var html =
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1b1514">' +
    '<p style="margin:0 0 18px">' + escapeHtml(greeting) + '</p>' +
    '<p style="margin:0 0 18px">You are registered for <strong>Democracy Salons — ' +
      escapeHtml(SALON.topic) + '</strong>.</p>' +
    '<p style="margin:0 0 28px">' +
      '<strong>When</strong><br>' + escapeHtml(when) + '<br><br>' +
      '<strong>Where</strong><br>' + escapeHtml(SALON.mode || 'Online') +
    '</p>' +
    joinBlock +
    '<p style="margin:0">See you there.<br>— DemCon × The Parlor</p>' +
    '</div>';

  return {
    subject: 'You are in — Democracy Salons ' + SALON.number + ': ' + SALON.topic,
    text: lines.join('\n'),
    html: html
  };
}

// The Parlor Magazine's list is on MailerLite while everything else here is
// on Sender, so an opt-in has to be written to a second provider entirely --
// there is no group on the Sender side that could stand in for it.
//
// POST /subscribers upserts: 201 for a new subscriber, 200 for one already
// known, so a repeat registration is not an error. Whether they then get a
// confirmation email is MailerLite's own double opt-in setting, which is
// account-level and deliberately not overridden here.
async function addToParlorNewsletter(email, firstName, lastName) {
  var apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    console.warn('submit-form: MAILERLITE_API_KEY unset -- Parlor opt-in recorded but not subscribed');
    return;
  }

  var body = { email: email, fields: {} };
  if (firstName) body.fields.name = firstName;
  if (lastName) body.fields.last_name = lastName;
  var groupId = process.env.MAILERLITE_GROUP_PARLOR;
  if (groupId) body.groups = [groupId];

  var res = await fetch(MAILERLITE_API_BASE + '/subscribers', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error('MailerLite subscribe failed', res.status, await res.text());
  }
}

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
  var notifyErrorDetail = null;
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
      notifyErrorDetail = await sendRes.text();
      console.error('Sender transactional email failed', sendRes.status, notifyErrorDetail);
    }
  } catch (err) {
    notifyErrorDetail = String(err);
    console.error('Sender transactional email error', err);
  }

  // Best-effort subscriber capture -- a failure here shouldn't fail the
  // whole request, since the notification email above is the part the
  // site owner actually depends on arriving.
  try {
    var nameSource = fields.Name || fields['Full Name'] || '';
    var nameParts = String(nameSource).trim().split(/\s+/).filter(Boolean);

    // Which Sender lists this person lands on. The salons page's note beside
    // the checkbox states the rule, and this is the Sender half of it:
    // registering for a salon puts you on DemCon's newsletter automatically.
    // The other half -- the opt-in, which is The Parlor Magazine's list --
    // is on MailerLite and is sent separately below.
    var groups = [];
    var groupId = config.groupEnvVar && process.env[config.groupEnvVar];
    if (groupId) groups.push(groupId);
    if (SALON_FORMS[formType] && process.env.SENDER_GROUP_NEWSLETTER) {
      groups.push(process.env.SENDER_GROUP_NEWSLETTER);
    }

    var subscriberBody = {
      email: fields.Email.trim(),
      firstname: nameParts[0],
      lastname: nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined
    };
    // A salon registration's own group can be the newsletter group; sending
    // the same id twice is the kind of thing an API is entitled to reject.
    groups = groups.filter(function (id, i) { return groups.indexOf(id) === i; });
    if (groups.length) subscriberBody.groups = groups;

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

  // The opt-in, on the other provider. Honoured only on the salon forms,
  // because those are the ones whose wording promises it; the same checkbox
  // on another form means whatever that form's own copy says it means.
  // Best-effort like the capture above -- a list that did not take the
  // subscriber is not a reason to tell someone their registration failed.
  if (SALON_FORMS[formType] && fields.Newsletter === 'yes') {
    try {
      var parlorName = String(fields.Name || fields['Full Name'] || '').trim().split(/\s+/).filter(Boolean);
      await addToParlorNewsletter(
        fields.Email.trim(),
        parlorName[0] || '',
        parlorName.length > 1 ? parlorName.slice(1).join(' ') : ''
      );
    } catch (err) {
      console.error('MailerLite subscribe error', err);
    }
  }

  // The registrant's own copy: what they signed up for, and how to join it.
  // Best-effort, like the subscriber capture above -- if this fails the
  // person is still registered and the notification above still told the
  // organisers so, and failing the whole request would only produce a second
  // registration from someone who thought the first had not worked.
  if (SALON_FORMS[formType]) {
    try {
      var joinUrl = process.env.SALON_JOIN_URL;
      if (!joinUrl) {
        console.warn('submit-form: SALON_JOIN_URL is unset -- confirmation sent without joining details');
      }
      var firstName = String(fields.Name || fields['Full Name'] || '').trim().split(/\s+/)[0] || '';
      var confirmation = salonConfirmation(firstName, joinUrl);

      var confirmRes = await fetch(SENDER_API_BASE + '/message/send', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          from: { email: fromEmail, name: fromName },
          to: { email: fields.Email.trim() },
          subject: confirmation.subject,
          text: confirmation.text,
          html: confirmation.html
        })
      });
      if (!confirmRes.ok) {
        console.error('Salon confirmation failed', confirmRes.status, await confirmRes.text());
      }
    } catch (err) {
      console.error('Salon confirmation error', err);
    }
  }

  if (!notified) {
    // ?debug=1 surfaces Sender's actual rejection reason in the response
    // itself -- handy for diagnosing setup issues (DNS/DMARC alignment,
    // bad key, etc.) via curl without digging through Vercel's log UI.
    // Never enabled for real visitors; the client-side forms never add
    // this query param.
    var response = { ok: false, error: 'Could not send notification email' };
    if (req.query && req.query.debug === '1') response.detail = notifyErrorDetail;
    res.status(502).json(response);
    return;
  }

  res.status(200).json({ ok: true });
};
