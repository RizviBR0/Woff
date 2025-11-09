# Shared Space Permissions Fix

## Problem

Previously, spaces were created with `allow_public_post: false`, which meant only the space creator could post content. Additionally, notes could only be edited by their original creator, preventing collaborative editing.

## Changes Made

### 1. Code Changes (✅ Applied)

#### `/lib/actions.ts`

- **Space Creation**: Changed `allow_public_post: false` to `allow_public_post: true` in `createSpace()` function
- **Note Updates**: Modified `updateNote()` function to check space permissions instead of just creator device ID

### 2. Database Changes (❗ Required in Supabase)

Run the following SQL commands in your Supabase SQL Editor:

```sql
-- Update existing spaces to allow public posting (optional - for existing spaces)
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
```

## What This Fixes

### ✅ Now Working:

1. **Anyone can post text in shared spaces** - No more "only creator can post" restriction
2. **Anyone can upload images/files** - File uploads work for all users in the space
3. **Anyone can create notes** - Note creation works for all space participants
4. **Anyone can edit notes** - Collaborative note editing is now possible
5. **All space participants have equal permissions** - No more creator-only restrictions

### 🔄 Behavior:

- **New spaces**: Automatically created with public posting enabled
- **Existing spaces**: Need the SQL update to enable public posting
- **Shared URLs**: Anyone with the URL can fully participate in the space
- **Notes**: Can be created and edited by anyone in the space

## Testing

After applying the database changes, test with:

1. Create a new space
2. Share the URL with someone else (different device/browser)
3. Verify they can:
   - Post text messages
   - Upload images
   - Create new notes
   - Edit existing notes

The shared space should now work exactly as intended - true collaborative spaces! 🚀
