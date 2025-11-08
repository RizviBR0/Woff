# Quick Database Fix for RLS Issues

If you're getting RLS policy violations, run this simpler setup first:

## Temporary Fix - Disable Complex RLS

```sql
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow insert when device matches creator or public posting allowed" ON entries;
DROP POLICY IF EXISTS "Allow creator to read their space entries" ON entries;
DROP POLICY IF EXISTS "Allow public read for public/unlisted space entries" ON entries;

-- Create simpler policies for entries
CREATE POLICY "Allow anyone to read entries" ON entries
  FOR SELECT USING (true);

CREATE POLICY "Allow anyone to insert entries" ON entries
  FOR INSERT WITH CHECK (true);

-- Also simplify spaces policies
DROP POLICY IF EXISTS "Allow creator to read their spaces" ON spaces;
DROP POLICY IF EXISTS "Allow public read for public/unlisted spaces" ON spaces;

CREATE POLICY "Allow anyone to read spaces" ON spaces
  FOR SELECT USING (true);
```

## After testing, you can re-enable proper RLS later

This will get your app working immediately. Once everything is functional, we can add back the proper security policies.

## Alternative: Disable RLS entirely for testing

```sql
-- Temporarily disable RLS (NOT recommended for production)
ALTER TABLE entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE spaces DISABLE ROW LEVEL SECURITY;
```
