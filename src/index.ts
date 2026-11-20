#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createJobsMcpServer } from './server.js';

const server = createJobsMcpServer();

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error('ruyuejian-jobs-mcp failed to start:', error);
  process.exitCode = 1;
}
