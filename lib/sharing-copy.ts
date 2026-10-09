export const SHARING_NOTICE =
  "Keep a copy of anything you need. Woff is for sharing, not backups.";

export const STANDARD_SPACE_RETENTION =
  "New rooms have no time limit. The owner can set or remove a deadline from Share. Older rooms may still have their original 48-hour inactivity timer until the owner changes it.";

export const PRO_SPACE_RETENTION =
  "Time limits are available on Free and Pro. A chosen deadline does not move when someone posts or downloads a file. Check the time shown in the room and keep your own copies.";

export const EXTENSION_FILE_RETENTION =
  "Chrome extension uploads expire 48 hours after upload, even if the room stays active or is Pro.";

export const SHARING_FAQS = [
  {
    question: "Is Woff cloud storage?",
    answer:
      "No. Woff is for instant file sharing between devices or with other people. Keep your original files or download a copy of anything you need. Woff is not a permanent storage or backup service.",
  },
  {
    question: "How long are files available?",
    answer: `${STANDARD_SPACE_RETENTION} ${EXTENSION_FILE_RETENTION} Keep your originals or download a copy; a room without a deadline is still not a backup.`,
  },
  {
    question: "What happens when a space expires?",
    answer:
      "The space is no longer available to open, and its content is scheduled for permanent deletion. Download files before expiry. A recovery key restores creator controls; it cannot restore deleted files or notes.",
  },
  {
    question: "How do I keep my files?",
    answer:
      "Keep your originals, or use Download on the shared files to save a copy to your device before they expire. Save any notes you need outside Woff too. Keeping a room link or recovery key is not a backup.",
  },
];
