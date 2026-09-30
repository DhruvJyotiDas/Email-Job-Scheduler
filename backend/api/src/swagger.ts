export const openapi = {
  openapi: '3.0.3',
  info: { title: 'Email Job Scheduler API', version: '0.1.0', description: 'Cookie-authenticated (ejs_token) REST API.' },
  paths: {
    '/api/auth/google': { get: { summary: 'Start Google OAuth', responses: { '302': { description: 'Redirect' } } } },
    '/api/auth/me': { get: { summary: 'Current user', responses: { '200': { description: 'User' } } } },
    '/api/campaigns': {
      post: {
        summary: 'Schedule a campaign (idempotent: identical payload returns the same campaign)',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['recipients', 'subject', 'body', 'startAt'],
                properties: {
                  senderId: { type: 'string' },
                  recipients: { type: 'array', items: { type: 'object', properties: { email: { type: 'string' }, variables: { type: 'object' } } } },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                  startAt: { type: 'string', format: 'date-time' },
                  delayMs: { type: 'integer' },
                  hourlyLimit: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Created' }, '200': { description: 'Duplicate of existing campaign' } },
      },
    },
    '/api/campaigns/{id}': { get: { summary: 'Campaign progress', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/api/emails': { get: { summary: 'List emails', parameters: [{ name: 'tab', in: 'query', schema: { enum: ['scheduled', 'sent'] } }], responses: { '200': { description: 'OK' } } } },
    '/api/emails/counts': { get: { summary: 'Tab counts', responses: { '200': { description: 'OK' } } } },
    '/api/emails/search': { get: { summary: 'Onebox search (Elasticsearch, highlighted)', parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } } },
    '/api/senders': { get: { summary: 'Senders with hourly usage', responses: { '200': { description: 'OK' } } } },
    '/api/slack/connect': { get: { summary: 'Start Slack OAuth', responses: { '302': { description: 'Redirect' } } } },
  },
};
