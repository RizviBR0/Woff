-- Update existing spaces to allow public posting (optional - for existing spaces)
-- You can run this if you want to update existing spaces, or just let new spaces work correctly
UPDATE spaces SET allow_public_post = true WHERE allow_public_post = false;

-- Update RLS policy for entries to allow updates when public posting is allowed
DROP POLICY IF EXISTS "Allow update when device matches creator or public posting allowed" ON entries;

CREATE POLICY "Allow update when device matches creator or public posting allowed" ON entries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM spaces
      WHERE spaces.id = entries.space_id
      AND (
        spaces.creator_device_id = current_setting('request.cookie.device_id', true)
        OR spaces.allow_public_post = true
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM spaces
      WHERE spaces.id = entries.space_id
      AND (
        spaces.creator_device_id = current_setting('request.cookie.device_id', true)
        OR spaces.allow_public_post = true
      )
    )
  );

-- Also ensure we have policies for DELETE operations (in case needed)
DROP POLICY IF EXISTS "Allow delete when device matches creator or public posting allowed" ON entries;

CREATE POLICY "Allow delete when device matches creator or public posting allowed" ON entries
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM spaces
      WHERE spaces.id = entries.space_id
      AND (
        spaces.creator_device_id = current_setting('request.cookie.device_id', true)
        OR spaces.allow_public_post = true
      )
    )
  );

-- Check and enable real-time for entries table if not already enabled
DO $$
BEGIN
    -- Try to add entries table to realtime publication
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE entries;
        RAISE NOTICE 'Added entries table to supabase_realtime publication';
    EXCEPTION 
        WHEN duplicate_object THEN
            RAISE NOTICE 'entries table is already in supabase_realtime publication';
    END;
    
    -- Try to add spaces table to realtime publication
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE spaces;
        RAISE NOTICE 'Added spaces table to supabase_realtime publication';
    EXCEPTION 
        WHEN duplicate_object THEN
            RAISE NOTICE 'spaces table is already in supabase_realtime publication';
    END;
END
$$;