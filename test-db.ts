// Test script to verify database operations
// Run this with: npx tsx test-db.ts

import {
  createSpace,
  createNoteEntry,
  updateNote,
  getNote,
} from "./lib/actions";

async function testDatabaseOperations() {
  console.log("🧪 Starting database operation tests...");

  try {
    // Test 1: Create a space
    console.log("🧪 Test 1: Creating space...");
    const space = await createSpace();
    console.log("✅ Space created:", space);

    // Test 2: Create a note entry
    console.log("🧪 Test 2: Creating note entry...");
    const noteData = await createNoteEntry(space.id, "Test Note");
    console.log("✅ Note entry created:", noteData);

    // Test 3: Update the note
    console.log("🧪 Test 3: Updating note...");
    const updatedNote = await updateNote(noteData.noteSlug, {
      title: "Updated Test Note",
      content: "<p>This is test content</p>",
      visibility: "unlisted",
      font_family: "system",
    });
    console.log("✅ Note updated:", updatedNote);

    // Test 4: Get the note
    console.log("🧪 Test 4: Getting note...");
    const retrievedNote = await getNote(noteData.noteSlug);
    console.log("✅ Note retrieved:", retrievedNote);

    console.log("🎉 All tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testDatabaseOperations();
