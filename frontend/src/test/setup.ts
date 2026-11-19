/**
 * File: src/test/setup.ts
 *
 * Runs before every frontend test file: adds DOM matchers (toBeInTheDocument, ...) and
 * cleans the rendered page between tests.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
