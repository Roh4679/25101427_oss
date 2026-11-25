#!/usr/bin/env node
import { MAX_BYTES, run } from './cli.ts';

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of process.stdin) {
    chunks.push(c);
    size += c.length;
    if (size > MAX_BYTES) break; // run() reports the size error
  }
  return Buffer.concat(chunks).toString('utf8');
}

process.exitCode = await run(process.argv.slice(2), {
  readStdin,
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
});
