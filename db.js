const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

const STATUS_OPTIONS = [
  'Information Received',
  'Picked Up',
  'In Transit',
  'Arrived at Sort Facility',
  'Departed Sort Facility',
  'Arrived in Destination Country',
  'Customs Clearance',
  'Customs Cleared',
  'Out for Delivery',
  'Delivered',
  'Exception',
  'On Hold'
];

const SERVICE_OPTIONS = [
  'SF International Priority',
  'SF International Standard',
  'SF International Economy',
  'SF International Parcel'
];

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS waybills (
      id SERIAL PRIMARY KEY,
      tracking_number TEXT UNIQUE NOT NULL,
      sender_name TEXT,
      sender_location TEXT,
      receiver_name TEXT,
      receiver_location TEXT,
      service_type TEXT,
      pieces INTEGER,
      weight_kg NUMERIC,
      current_status TEXT NOT NULL DEFAULT 'Information Received',
      estimated_delivery DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracking_events (
      id SERIAL PRIMARY KEY,
      waybill_id INTEGER NOT NULL REFERENCES waybills(id) ON DELETE CASCADE,
      event_time TIMESTAMPTZ NOT NULL,
      location TEXT,
      status TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tracking_events_waybill_id ON tracking_events(waybill_id);
  `);
}

module.exports = { pool, init, STATUS_OPTIONS, SERVICE_OPTIONS };
