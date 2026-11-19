import { config } from '../config.js';
import { migrate } from './migrate.js';

await migrate(config.databaseUrl);
