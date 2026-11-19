import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { DB } from '../../src/db/client.js';
import type { Clock } from '../../src/lib/clock.js';

export type Agent = ReturnType<typeof request.agent>;

export function makeApp(db: DB, clock: Clock) {
  return createApp({ db, clock });
}

let counter = 0;

/** Signs up a fresh user and returns a supertest agent that carries their session cookie. */
export async function signUp(
  app: ReturnType<typeof createApp>,
  opts: { role: 'member' | 'professional'; timezone?: string; name?: string },
): Promise<{ agent: Agent; user: { id: string; name: string; role: string; timezone: string } }> {
  counter += 1;
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/signup').send({
    name: opts.name ?? `${opts.role} ${counter}`,
    email: `${opts.role}${counter}-${Date.now()}@example.com`,
    password: 'password123',
    role: opts.role,
    timezone: opts.timezone ?? 'UTC',
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.user };
}
