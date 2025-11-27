# Woff Database Schema

This file contains the SQL schema for the Woff application. Run these commands in your Supabase SQL editor.

## Tables

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Spaces table
CREATE TABLE spaces (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT,
  creator_device_id TEXT,
  visibility TEXT DEFAULT 'unlisted' CHECK (visibility IN ('public', 'unlisted', 'private')),
  allow_public_post BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

-- Entries table
CREATE TABLE entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'image', 'pdf', 'file')),
  text TEXT,
  meta JSONB,
  created_by_device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets table (for file uploads)
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

-- Views table (for analytics)
CREATE TABLE views (
  id BIGSERIAL PRIMARY KEY,
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  ua TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Device sessions table
CREATE TABLE device_sessions (
  device_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Row Level Security (RLS)

```sql
-- Enable RLS on all tables
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
```

## Indexes

```sql
-- Add useful indexes
CREATE INDEX idx_spaces_slug ON spaces(slug);
CREATE INDEX idx_spaces_creator_device_id ON spaces(creator_device_id);
CREATE INDEX idx_spaces_last_activity_at ON spaces(last_activity_at);
CREATE INDEX idx_entries_space_id ON entries(space_id);
CREATE INDEX idx_entries_created_at ON entries(created_at);
CREATE INDEX idx_assets_entry_id ON assets(entry_id);
CREATE INDEX idx_views_space_id ON views(space_id);
CREATE INDEX idx_views_created_at ON views(created_at);
```

## Auto-Cleanup (Inactive Spaces)

Spaces are automatically deleted after 7 days of inactivity. The following functions and triggers handle this:

```sql
-- Trigger function to update space activity when entries are added
CREATE OR REPLACE FUNCTION update_space_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE spaces
  SET last_activity_at = NOW()
  WHERE id = NEW.space_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on entries table
CREATE TRIGGER trigger_update_space_activity
AFTER INSERT ON entries
FOR EACH ROW
EXECUTE FUNCTION update_space_last_activity();

-- Function to delete inactive spaces
CREATE OR REPLACE FUNCTION cleanup_inactive_spaces(days_inactive INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM spaces
    WHERE last_activity_at < NOW() - (days_inactive || ' days')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule cleanup to run daily at 3:00 AM UTC (requires pg_cron extension)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-inactive-spaces',
  '0 3 * * *',
  $$SELECT cleanup_inactive_spaces(7)$$
);

-- Table to log deleted storage keys for cleanup
CREATE TABLE IF NOT EXISTS deleted_storage_keys (
  id BIGSERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to log storage keys before asset deletion
CREATE OR REPLACE FUNCTION log_deleted_assets()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO deleted_storage_keys (bucket_key)
  VALUES (OLD.bucket_key);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_deleted_assets
BEFORE DELETE ON assets
FOR EACH ROW
EXECUTE FUNCTION log_deleted_assets();
```

## Realtime

```sql
-- Enable realtime for entries table
ALTER PUBLICATION supabase_realtime ADD TABLE entries;
```
