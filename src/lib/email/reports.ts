import 'server-only'

const MAX_REPORT_EMAIL_RECIPIENTS = 10
const SENDGRID_MAIL_SEND_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send'

export class ReportEmailError extends Error {
  constructor(message: string, public readonly safeDetails?: Record<string, unknown>) {
    super(message)
    this.name = 'ReportEmailError'
  }
}

export type SendReportEmailInput = {
  to: string[] | string
  subject: string
  message?: string
  reportUrl: string
  organizationName: string
  sessionTitle: string
}

export type SendReportEmailResult = {
  id: string
  recipients: string[]
}

function splitRecipients(recipients: string[] | string) {
  if (Array.isArray(recipients)) {
    return recipients.map((recipient) => recipient.trim()).filter(Boolean)
  }

  return recipients.split(/[;,\s]+/).map((recipient) => recipient.trim()).filter(Boolean)
}

function validateRecipient(recipient: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
}

export function validateReportEmailRecipients(recipients: string[] | string) {
  const parsedRecipients = Array.from(new Set(splitRecipients(recipients).map((recipient) => recipient.toLowerCase())))

  if (parsedRecipients.length === 0) {
    throw new ReportEmailError('Enter at least one recipient email.')
  }

  if (parsedRecipients.length > MAX_REPORT_EMAIL_RECIPIENTS) {
    throw new ReportEmailError(`Enter ${MAX_REPORT_EMAIL_RECIPIENTS} or fewer recipient emails.`)
  }

  const invalidRecipients = parsedRecipients.filter((recipient) => !validateRecipient(recipient))
  if (invalidRecipients.length > 0) {
    throw new ReportEmailError(`Check these recipient emails: ${invalidRecipients.join(', ')}.`)
  }

  return parsedRecipients
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function buildTextEmail(input: SendReportEmailInput) {
  const customMessage = normalizeText(input.message ?? '')
  const lines = [
    'A report has been shared with you.',
    '',
    `Organization: ${input.organizationName}`,
    `Session: ${input.sessionTitle}`,
    '',
  ]

  if (customMessage) {
    lines.push(customMessage, '')
  }

  lines.push(
    `Secure printable report link: ${input.reportUrl}`,
    '',
    'Use your browser Print or Share menu to save as PDF.',
  )

  return lines.join('\n')
}

function buildHtmlEmail(input: SendReportEmailInput) {
  const customMessage = normalizeText(input.message ?? '')
  const customMessageHtml = customMessage
    ? `<p>${escapeHtml(customMessage).replace(/\n/g, '<br />')}</p>`
    : ''

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <p>A report has been shared with you.</p>
      <dl>
        <dt style="font-weight: 700;">Organization</dt>
        <dd style="margin: 0 0 12px;">${escapeHtml(input.organizationName)}</dd>
        <dt style="font-weight: 700;">Session</dt>
        <dd style="margin: 0 0 12px;">${escapeHtml(input.sessionTitle)}</dd>
      </dl>
      ${customMessageHtml}
      <p><a href="${escapeHtml(input.reportUrl)}" style="display: inline-block; padding: 10px 14px; border-radius: 8px; background: #111827; color: #ffffff; text-decoration: none;">Open Printable Report</a></p>
      <p>Use your browser Print or Share menu to save as PDF.</p>
      <p style="color: #6b7280; font-size: 14px;">Secure printable report link: <a href="${escapeHtml(input.reportUrl)}">${escapeHtml(input.reportUrl)}</a></p>
    </div>
  `
}

async function parseSendGridError(response: Response) {
  const body = await response.json().catch(() => null) as { errors?: Array<{ message?: string; field?: string; help?: string }> } | null

  return body?.errors?.map((error) => ({
    message: error.message,
    field: error.field,
    help: error.help,
  })) ?? []
}

export async function sendReportEmail(input: SendReportEmailInput): Promise<SendReportEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim()
  const from = process.env.REPORT_EMAIL_FROM?.trim()
  const recipients = validateReportEmailRecipients(input.to)

  if (!apiKey || !from) {
    console.error('Report email delivery is not configured.', {
      hasSendGridApiKey: Boolean(apiKey),
      hasReportEmailFrom: Boolean(from),
    })
    throw new ReportEmailError('Email delivery is not configured.')
  }

  const response = await fetch(SENDGRID_MAIL_SEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: recipients.map((email) => ({ email })),
          subject: input.subject,
        },
      ],
      from: { email: from },
      content: [
        { type: 'text/plain', value: buildTextEmail(input) },
        { type: 'text/html', value: buildHtmlEmail(input) },
      ],
    }),
  })

  const messageId = response.headers.get('x-message-id')

  if (!response.ok || !messageId) {
    const providerErrors = await parseSendGridError(response)
    console.error('Report email provider rejected delivery.', {
      provider: 'sendgrid',
      status: response.status,
      errors: providerErrors,
    })
    throw new ReportEmailError('Email could not be sent. Please try again.')
  }

  return { id: messageId, recipients }
}
