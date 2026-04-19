// Selects which museum API to use based on env var.
// Set VITE_CATALOG_SOURCE=harvard in .env.local to switch.

import * as aic from './aic.js';
import * as harvard from './harvard.js';

const source = (import.meta.env.VITE_CATALOG_SOURCE || 'aic').toLowerCase();

const clients = {
  aic,
  harvard,
};

const client = clients[source] || clients.aic;

export const fetchPage = client.fetchPage;
export const SOURCE_NAME = client.SOURCE_NAME;
export const ACTIVE_SOURCE = source;
