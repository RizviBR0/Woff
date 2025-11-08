-- Temporary fix for RLS issues
-- Run this in your Supabase SQL editor to allow basic operations

-- Drop existing restrictive policies on entries
DROP POLICY IF EXISTS "Allow insert when device matches creator or public posting allowed" ON entries;
DROP POLICY IF EXISTS "Allow creator to read their space entries" ON entries;
DROP POLICY IF EXISTS "Allow public read for public/unlisted space entries" ON entries;

-- Create simple policies that allow all operations for testing
CREATE POLICY "Allow anyone to read entries" ON entries
  FOR SELECT USING (true);

CREATE POLICY "Allow anyone to insert entries" ON entries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anyone to update entries" ON entries
  FOR UPDATE USING (true) WITH CHECK (true);

-- Also simplify spaces policies
DROP POLICY IF EXISTS "Allow creator to read their spaces" ON spaces;
DROP POLICY IF EXISTS "Allow public read for public/unlisted spaces" ON spaces;

CREATE POLICY "Allow anyone to read spaces" ON spaces
  FOR SELECT USING (true);

CREATE POLICY "Allow anyone to update spaces" ON spaces
  FOR UPDATE USING (true) WITH CHECK (true);

-- Make sure we can also delete if needed
CREATE POLICY "Allow anyone to delete entries" ON entries
  FOR DELETE USING (true);

CREATE POLICY "Allow anyone to delete spaces" ON spaces  
  FOR DELETE USING (true);