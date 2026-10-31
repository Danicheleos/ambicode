import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HttpHost, HttpRequest } from '#types/platform/ports';

export const nodeHttpHost: HttpHost = {
  async listen(handler, port = 0) {
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const headers: HttpRequest['headers'] = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(',') : value]));
        handler({ method: request.method ?? 'GET', url: request.url ?? '/', headers, body: Buffer.concat(chunks).toString('utf8') }).then(
          (reply) => response.writeHead(reply.status, reply.headers).end(reply.body),
          () => response.writeHead(500).end(),
        );
      });
    });
    // Loopback literal, not "localhost": that name can resolve to an external address.
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
    return {
      port: (server.address() as AddressInfo).port,
      close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections(); }),
    };
  },
  call: (port, { method, url, headers = {}, body = '' }) => new Promise((resolve) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, path: url, method, headers, timeout: 3000 }, (response) => {
      let text = '';
      response.on('data', (chunk: Buffer) => (text += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text }));
    });
    outgoing.on('error', () => resolve(null));
    outgoing.on('timeout', () => outgoing.destroy());
    outgoing.end(body);
  }),
};
