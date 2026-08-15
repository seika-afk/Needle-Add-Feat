// @ts-nocheck
require('dotenv').config();

const { App } = require('@slack/bolt');
const { generateTargets } = require('../filterGen');
const { matchesRole } = require('../helpers');
const { domainSearch } = require('../tomba');
const { research } = require('../research');
const { generateEmail } = require('../generate_mail');
const { sendEmail } = require('../reach_out');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const reasoningByThread = new Map();
const reasoningByMessage = new Map();
const flowByThread = new Map();

function getThreadState(threadTs) {
  if (!flowByThread.has(threadTs)) {
    flowByThread.set(threadTs, {});
  }

  return flowByThread.get(threadTs);
}

function mergeThreadState(threadTs, patch) {
  const nextState = { ...getThreadState(threadTs), ...patch };
  flowByThread.set(threadTs, nextState);
  return nextState;
}

function recordReasoning(threadTs, messageTs, reason, meta = {}) {
  if (!reasoningByThread.has(threadTs)) reasoningByThread.set(threadTs, []);
  const steps = reasoningByThread.get(threadTs);
  const letter = String.fromCharCode(97 + steps.length);
  const entry = { letter, ts: messageTs, reason, meta };

  steps.push(entry);
  reasoningByMessage.set(messageTs, { letter, reason, threadTs, meta });
  mergeThreadState(threadTs, { reasoning: steps });

  return letter;
}

function buildLoadingBlocks(title, detail) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:hourglass_flowing_sand: *${title}*${detail ? `\n${detail}` : ''}`,
      },
    },
  ];
}

async function postWithReasoning(client, messageArgs, reasoning, meta = {}) {
  const posted = await client.chat.postMessage(messageArgs);
  const threadTs = messageArgs.thread_ts || posted.ts;
  recordReasoning(threadTs, posted.ts, reasoning, meta);
  return posted;
}

async function postLoadingMessage(client, messageArgs, reasoning, meta = {}) {
  return postWithReasoning(
    client,
    {
      ...messageArgs,
      text: messageArgs.text || 'Working...',
      blocks: messageArgs.blocks || buildLoadingBlocks(messageArgs.text || 'Working...', messageArgs.detail),
    },
    reasoning,
    meta
  );
}

async function updateWithReasoning(client, messageArgs, reasoning, meta = {}) {
  const updated = await client.chat.update(messageArgs);
  const threadTs = messageArgs.thread_ts || messageArgs.ts;
  recordReasoning(threadTs, messageArgs.ts, reasoning, meta);
  return updated;
}

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function uniqueByEmail(results) {
  const seen = new Set();
  return results.filter((person) => {
    const key = (person.email || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeLead(candidate, company, query) {
  const label =
    candidate.full_name ||
    [candidate.first_name, candidate.last_name].filter(Boolean).join(' ') ||
    candidate.email;

  return {
    label,
    email: candidate.email,
    role: candidate.position || candidate.department || 'Unknown role',
    company: candidate.company || company.name,
    companyDomain: company.domain,
    linkedin: candidate.linkedin || '',
    query,
    raw: candidate,
  };
}

async function findLeads(prompt) {
  const targets = await generateTargets(prompt);
  const candidates = [];

  for (const company of targets.target_companies || []) {
    try {
      const result = await domainSearch(company.domain, { company: company.name });
      const rawLeads = (result.emails || []).map((candidate) => normalizeLead(candidate, company, prompt));
      const matched = rawLeads.filter((candidate) => matchesRole(candidate.raw, targets.role_keywords || []));

      candidates.push(...(matched.length > 0 ? matched : rawLeads));
    } catch (err) {
      console.error(err);
    }
  }

  return {
    targets,
    leads: uniqueByEmail(candidates),
  };
}

function buildLeadBlocks(leads, prompt, targetingReasoning) {
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*Pick a lead for:* ${prompt}` } },
  ];

  if (targetingReasoning) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `*Targeting rationale:* ${targetingReasoning}` }],
    });
  }

  blocks.push({ type: 'divider' });

  leads.forEach((lead) => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${lead.label}*\n${lead.email} — ${lead.role}\n${lead.company}`,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Select' },
        action_id: 'select_lead',
        value: JSON.stringify(lead),
      },
    });
  });

  return blocks;
}

function buildResearchBlocks(lead, researchSummary) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${lead.label}*\n` +
          `${lead.role} at ${lead.company}\n` +
          `${lead.companyDomain || ''}\n\n` +
          `${researchSummary}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Draft Email' },
          action_id: 'compose_email',
          value: JSON.stringify({ email: lead.email }),
        },
      ],
    },
  ];
}

function buildDraftBlocks(draft, lead, userQuery) {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*To:* ${draft.to}\n*Subject:* ${draft.subject}\n\n${draft.text}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*Request:* ${userQuery}`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Fix' },
          action_id: 'fix_email',
          value: JSON.stringify({ email: lead.email }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Send' },
          style: 'primary',
          action_id: 'confirm_send_email',
          value: JSON.stringify({ email: lead.email }),
        },
      ],
    },
  ];
}

function getEmailQueryModalView(threadTs, lead, initialValue = '') {
  return {
    type: 'modal',
    callback_id: 'email_query_modal',
    private_metadata: JSON.stringify({ threadTs, lead }),
    title: { type: 'plain_text', text: 'Draft email' },
    submit: { type: 'plain_text', text: 'Generate' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'email_query_block',
        label: { type: 'plain_text', text: 'What should the email say?' },
        element: {
          type: 'plain_text_input',
          action_id: 'email_query_input',
          multiline: true,
          initial_value: initialValue,
        },
      },
    ],
  };
}

function buildResearchInput(lead, state, query) {
  return [
    `Lead email: ${lead.email}`,
    `Lead name: ${lead.label}`,
    `Role: ${lead.role}`,
    `Company: ${lead.company}`,
    lead.companyDomain ? `Domain: ${lead.companyDomain}` : null,
    lead.linkedin ? `LinkedIn: ${lead.linkedin}` : null,
    state.prompt ? `Original lead search prompt: ${state.prompt}` : null,
    state.targetingReasoning ? `Targeting reasoning: ${state.targetingReasoning}` : null,
    query ? `User email request: ${query}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildEmailExtraInfo(lead, state, researchResult) {
  return [
    `Lead: ${lead.label} <${lead.email}>`,
    lead.company ? `Company: ${lead.company}` : null,
    lead.role ? `Role: ${lead.role}` : null,
    state.prompt ? `Lead search prompt: ${state.prompt}` : null,
    state.targetingReasoning ? `Targeting reasoning: ${state.targetingReasoning}` : null,
    researchResult?.reasoning ? `Research reasoning: ${researchResult.reasoning}` : null,
    researchResult?.content?.summary ? `Research summary:\n${researchResult.content.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

app.command('/find_lead', async ({ command, ack, client }) => {
  await ack();

  const posted = await postLoadingMessage(
    client,
    {
      channel: command.channel_id,
      text: 'Finding leads...',
      blocks: buildLoadingBlocks('Finding leads', 'Searching companies and matching people.'),
    },
    `Triggered by /find_lead "${command.text}" from <@${command.user_id}>.`,
    { stage: 'command_started', prompt: command.text }
  );

  mergeThreadState(posted.ts, {
    prompt: command.text,
    requester: command.user_id,
    channelId: command.channel_id,
  });

  try {
    const { targets, leads } = await findLeads(command.text);
    mergeThreadState(posted.ts, {
      targetingReasoning: targets.reasoning,
      roleKeywords: targets.role_keywords,
      leads,
    });

    if (leads.length === 0) {
      await updateWithReasoning(
        client,
        {
          channel: command.channel_id,
          ts: posted.ts,
          text: 'No matching leads were found. Try broadening the prompt.',
          blocks: buildLoadingBlocks('No matching leads were found', 'Try broadening the prompt.'),
        },
        `Ran lead search for "${command.text}" but found no candidates.`,
        { stage: 'no_results' }
      );
      return;
    }

    await updateWithReasoning(
      client,
      {
        channel: command.channel_id,
        ts: posted.ts,
        text: 'Here are the leads I found:',
        blocks: buildLeadBlocks(leads, command.text, targets.reasoning),
      },
      `Ran lead search for "${command.text}" and found ${leads.length} candidate(s).`,
      { stage: 'results', count: leads.length }
    );
  } catch (err) {
    console.error(err);
    await client.chat.postMessage({
      channel: command.channel_id,
      thread_ts: posted.ts,
      text: 'Something went wrong while researching that. Try again?',
    });
  }
});

app.action('select_lead', async ({ ack, body, client, action }) => {
  await ack();

  const lead = safeJsonParse(action.value);
  const threadTs = body.message.thread_ts || body.message.ts;
  const state = mergeThreadState(threadTs, { lead });

  const loadingMessage = await postLoadingMessage(
    client,
    {
      channel: body.channel.id,
      thread_ts: threadTs,
      text: `Researching ${lead.label}...`,
      blocks: buildLoadingBlocks(`Researching ${lead.label}`, 'Checking live details before drafting outreach.'),
    },
    `<@${body.user.id}> selected "${lead.label}" from the lead list.`,
    { stage: 'lead_selected', leadEmail: lead.email }
  );

  try {
    const researchInput = buildResearchInput(lead, state, lead.query);
    const researchResult = await research(researchInput);

    mergeThreadState(threadTs, {
      research: researchResult,
      researchSummary: researchResult.content.summary,
      researchReasoning: researchResult.reasoning,
      lead,
    });

    await updateWithReasoning(
      client,
      {
        channel: body.channel.id,
        ts: loadingMessage.ts,
        text: `Info about ${lead.label}`,
        blocks: buildResearchBlocks(lead, researchResult.content.summary),
      },
      `Ran research() on "${lead.label}" to enrich their profile before drafting outreach.`,
      { stage: 'research_complete', leadEmail: lead.email }
    );
  } catch (err) {
    console.error(err);
    await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: threadTs,
      text: `Something went wrong researching ${lead.label}. Try again?`,
    });
  }
});

async function openEmailQueryModal({ client, body, lead, threadTs }) {
  const state = getThreadState(threadTs);
  await client.views.open({
    trigger_id: body.trigger_id,
    view: getEmailQueryModalView(threadTs, lead, state.emailQuery || lead.query || ''),
  });
}

app.action('compose_email', async ({ ack, body, client, action }) => {
  await ack();

  const threadTs = body.message.thread_ts || body.message.ts;
  const lead = safeJsonParse(action.value, getThreadState(threadTs).lead || {});
  mergeThreadState(threadTs, { lead });

  await openEmailQueryModal({ client, body, lead, threadTs });
});

app.action('fix_email', async ({ ack, body, client, action }) => {
  await ack();

  const threadTs = body.message.thread_ts || body.message.ts;
  const lead = safeJsonParse(action.value, getThreadState(threadTs).lead || {});
  mergeThreadState(threadTs, { lead });

  await openEmailQueryModal({ client, body, lead, threadTs });
});

app.view('email_query_modal', async ({ ack, body, view, client }) => {
  await ack();

  const { threadTs, lead } = safeJsonParse(view.private_metadata, {});
  const state = getThreadState(threadTs);
  const query =
    view.state.values.email_query_block?.email_query_input?.value?.trim() ||
    state.emailQuery ||
    lead?.query ||
    '';

  mergeThreadState(threadTs, {
    emailQuery: query,
    lead,
  });

  const posted = await postLoadingMessage(
    client,
    {
      channel: state.channelId,
      thread_ts: threadTs,
      text: `Drafting email for ${lead.label}...`,
      blocks: buildLoadingBlocks(`Drafting email for ${lead.label}`, 'Generating subject and body from your request.'),
    },
    `<@${body.user.id}> provided the email request for "${lead.label}".`,
    { stage: 'email_request_received', leadEmail: lead.email, query }
  );

  try {
    const researchResult = state.research || {
      content: { summary: state.researchSummary || '' },
      reasoning: state.researchReasoning || '',
    };
    const extraInfo = buildEmailExtraInfo(lead, state, researchResult);
    const draftResult = await generateEmail({
      to: lead.email,
      userQuery: query,
      extraInfo,
    });

    const draft = draftResult.content;
    mergeThreadState(threadTs, {
      draft,
      draftReasoning: draftResult.reasoning,
    });

    await updateWithReasoning(
      client,
      {
        channel: state.channelId,
        ts: posted.ts,
        text: `Draft email for ${lead.label}`,
        blocks: buildDraftBlocks(draft, lead, query),
      },
      `Ran generateEmail() for "${lead.label}" using the user's requested email content.`,
      { stage: 'draft_ready', leadEmail: lead.email, subject: draft.subject }
    );
  } catch (err) {
    console.error(err);
    await client.chat.postMessage({
      channel: state.channelId,
      thread_ts: threadTs,
      text: `Something went wrong drafting that email. Try again?`,
    });
  }
});

app.action('confirm_send_email', async ({ ack, body, client, action }) => {
  await ack();

  const threadTs = body.message.thread_ts || body.message.ts;
  const lead = safeJsonParse(action.value, getThreadState(threadTs).lead || {});
  const state = getThreadState(threadTs);
  const draft = state.draft;

  if (!draft || !lead.email) {
    await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: threadTs,
      text: 'I could not find a draft to send for that lead.',
    });
    return;
  }

  try {
    await sendEmail(draft);
    mergeThreadState(threadTs, { sent: true, sentAt: new Date().toISOString() });

    await updateWithReasoning(
      client,
      {
        channel: body.channel.id,
        ts: body.message.ts,
        text: `Sent email to *${lead.label}* <${lead.email}>: *${draft.subject}*`,
        blocks: buildLoadingBlocks(
          `Sent email to ${lead.label}`,
          `Subject: ${draft.subject}\nRecipient: ${lead.email}`
        ),
      },
      `<@${body.user.id}> clicked "Send" to confirm and finalize the email to "${lead.label}".`,
      { stage: 'email_sent', leadEmail: lead.email, subject: draft.subject }
    );
  } catch (err) {
    console.error(err);
    await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: threadTs,
      text: `Something went wrong sending the email to ${lead.label}.`,
    });
  }
});

app.shortcut('explain_reasoning', async ({ shortcut, ack, client }) => {
  await ack();

  const messageTs = shortcut.message.ts;
  const entry = reasoningByMessage.get(messageTs);
  const threadTs = entry ? entry.threadTs : shortcut.message.thread_ts || messageTs;

  await client.chat.postEphemeral({
    channel: shortcut.channel.id,
    user: shortcut.user.id,
    thread_ts: threadTs,
    text: entry
      ? `*Step ${entry.letter}:* ${entry.reason}\n\n_(message id: ${messageTs})_`
      : `No reasoning found for this message (id: ${messageTs}) — it may predate this feature or the bot was restarted.`,
  });
});

(async () => {
  await app.start();
  console.log("START:::")
})();
