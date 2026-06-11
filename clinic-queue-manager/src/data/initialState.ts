/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QueueState } from '../types';

export const INITIAL_QUEUE_STATE: QueueState = {
  currentToken: {
    id: 'T1003',
    ticketNumber: 'A103',
    patientName: 'Tony Stark',
    patientPhone: '+1 (555) 762-7489',
    addedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 mins ago
    calledAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),   // 4 mins ago
    status: 'serving'
  },
  queue: [
    {
      id: 'T1004',
      ticketNumber: 'A104',
      patientName: 'Peter Parker',
      patientPhone: '+1 (555) 321-4567',
      addedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
      status: 'waiting'
    },
    {
      id: 'T1005',
      ticketNumber: 'A105',
      patientName: 'Clark Kent',
      patientPhone: '+1 (555) 987-6543',
      addedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(), // 8 mins ago
      status: 'waiting'
    },
    {
      id: 'T1006',
      ticketNumber: 'A106',
      patientName: 'Diana Prince',
      patientPhone: '+1 (555) 876-5432',
      addedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 mins ago
      status: 'waiting'
    }
  ],
  history: [
    {
      tokenId: 'T1001',
      ticketNumber: 'A101',
      durationSeconds: 152, // 2 mins 32s
      startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      endedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString()
    },
    {
      tokenId: 'T1002',
      ticketNumber: 'A102',
      durationSeconds: 198, // 3 mins 18s
      startedAt: new Date(Date.now() - 38 * 60 * 1000).toISOString(),
      endedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString()
    }
  ],
  receptionistConfig: {
    manualAvgMinutes: 5 // Default manual estimate (5 mins)
  },
  lastUpdated: new Date().toISOString(),
  version: 3
};

// Seed candidates for Quick Generation / Simulate Patient
export const MOCK_PATIENT_POOL = [
  { name: 'Bruce Wayne', phone: '+1 (555) 123-4567' },
  { name: 'Selina Kyle', phone: '+1 (555) 901-2345' },
  { name: 'Barry Allen', phone: '+1 (555) 777-8888' },
  { name: 'Hal Jordan', phone: '+1 (555) 234-5678' },
  { name: 'Arthur Curry', phone: '+1 (555) 345-6789' },
  { name: 'Victor Stone', phone: '+1 (555) 456-7890' },
  { name: 'Wanda Maximoff', phone: '+1 (555) 567-8901' },
  { name: 'Steve Rogers', phone: '+1 (555) 222-1918' },
  { name: 'Natasha Romanoff', phone: '+1 (555) 999-0077' },
  { name: 'Bruce Banner', phone: '+1 (555) 444-2003' }
];
