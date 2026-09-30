export const SHARING_NOTICE =
  "This is a temporary sharing space. Download anything you want to keep.";

export const STANDARD_SPACE_RETENTION =
  "Non-Pro spaces expire after 48 hours without new or edited content. Opening a room or downloading files does not reset the timer.";

export const PRO_SPACE_RETENTION =
  "Pro spaces do not expire from inactivity. Woff is still for sharing, not permanent storage or backups.";

export const EXTENSION_FILE_RETENTION =
  "Chrome extension uploads expire 48 hours after upload, even if the room stays active or is Pro.";

export const SHARING_FAQS = [
  {
    question: "Is Woff cloud storage?",
    answer:
      "No. Woff is for instant, temporary file sharing between devices or with other people. Keep your original files or download a copy of anything you need. Woff is not a permanent storage or backup service.",
  },
  {
    question: "How long are files available?",
    answer: `${STANDARD_SPACE_RETENTION} Adding content or editing a note starts a new 48-hour window. ${EXTENSION_FILE_RETENTION} ${PRO_SPACE_RETENTION}`,
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
