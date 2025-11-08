# Database Setup for Woff

## Quick Setup Instructions

1. **Go to your Supabase project dashboard:**

   - Visit https://supabase.com/dashboard
   - Select your project: `goitdofpzjjvwgxoykyy`

2. **Open the SQL Editor:**

   - In the left sidebar, click "SQL Editor"
   - Click "New Query"

3. **Run the setup script:**
   - Copy and paste the following SQL commands
   - Click "Run" to execute

## Setup SQL Script

```sql
-- Enable UUID extension (required for ID generation)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create spaces table
CREATE TABLE spaces (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT,
  creator_device_id TEXT,
  visibility TEXT DEFAULT 'unlisted' CHECK (visibility IN ('public', 'unlisted', 'private')),
  allow_public_post BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create entries table
CREATE TABLE entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'image', 'pdf', 'file')),
  text TEXT,
  meta JSONB,
  created_by_device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create assets table (for file uploads)
CREATE TABLE assets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  entry_id UUID REFERENCES entries(id) ON DELETE CASCADE,
  bucket_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size BIGINT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create views table (for analytics)
CREATE TABLE views (
  id BIGSERIAL PRIMARY KEY,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  ua TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create device sessions table
CREATE TABLE device_sessions (
  device_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE views ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;

-- Spaces policies
CREATE POLICY "Allow public read for public/unlisted spaces" ON spaces
  FOR SELECT USING (visibility IN ('public', 'unlisted'));

CREATE POLICY "Allow creator to read their spaces" ON spaces
  FOR SELECT USING (creator_device_id = current_setting('request.cookie.device_id', true));

CREATE POLICY "Allow anyone to insert spaces" ON spaces
  FOR INSERT WITH CHECK (true);

-- Entries policies
CREATE POLICY "Allow public read for public/unlisted space entries" ON entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM spaces
      WHERE spaces.id = entries.space_id
      AND spaces.visibility IN ('public', 'unlisted')
    )
  );

CREATE POLICY "Allow creator to read their space entries" ON entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM spaces
      WHERE spaces.id = entries.space_id
      AND spaces.creator_device_id = current_setting('request.cookie.device_id', true)
    )
  );

CREATE POLICY "Allow insert when device matches creator or public posting allowed" ON entries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM spaces
      WHERE spaces.id = entries.space_id
      AND (
        spaces.creator_device_id = current_setting('request.cookie.device_id', true)
        OR spaces.allow_public_post = true
      )
    )
  );

-- Assets policies
CREATE POLICY "Allow read access to assets for accessible entries" ON assets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entries
      JOIN spaces ON spaces.id = entries.space_id
      WHERE entries.id = assets.entry_id
      AND (
        spaces.visibility IN ('public', 'unlisted')
        OR spaces.creator_device_id = current_setting('request.cookie.device_id', true)
      )
    )
  );

CREATE POLICY "Allow insert assets for accessible entries" ON assets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM entries
      JOIN spaces ON spaces.id = entries.space_id
      WHERE entries.id = assets.entry_id
      AND (
        spaces.creator_device_id = current_setting('request.cookie.device_id', true)
        OR spaces.allow_public_post = true
      )
    )
  );

-- Views policies
CREATE POLICY "Allow anyone to insert views" ON views
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow reading views for space creators" ON views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM spaces
      WHERE spaces.id = views.space_id
      AND spaces.creator_device_id = current_setting('request.cookie.device_id', true)
    )
  );

-- Device sessions policies
CREATE POLICY "Allow anyone to insert device sessions" ON device_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow users to read their own sessions" ON device_sessions
  FOR SELECT USING (device_id = current_setting('request.cookie.device_id', true));

-- Create indexes for better performance
CREATE INDEX idx_spaces_slug ON spaces(slug);
CREATE INDEX idx_spaces_creator_device_id ON spaces(creator_device_id);
CREATE INDEX idx_entries_space_id ON entries(space_id);
CREATE INDEX idx_entries_created_at ON entries(created_at);
CREATE INDEX idx_assets_entry_id ON assets(entry_id);
CREATE INDEX idx_views_space_id ON views(space_id);
CREATE INDEX idx_views_created_at ON views(created_at);

-- Enable realtime for entries table (optional - for live updates)
-- ALTER PUBLICATION supabase_realtime ADD TABLE entries;
```

## After Running the Script

1. **Verify the tables were created:**

   - Go to "Table Editor" in the Supabase dashboard
   - You should see: `spaces`, `entries`, `assets`, `views`, `device_sessions`

2. **Test your app:**
   - Go back to http://localhost:3000
   - Click "Create Space" - it should work now!

## Troubleshooting

If you get permission errors:

- Make sure you're logged into Supabase as the project owner
- Check that RLS is enabled (it should be)
- Verify the policies were created correctly

If you need to reset:

```sql
-- Drop all tables (careful - this deletes all data!)
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS entries CASCADE;
DROP TABLE IF EXISTS views CASCADE;
DROP TABLE IF EXISTS device_sessions CASCADE;
DROP TABLE IF EXISTS spaces CASCADE;
```
