"use client";

import { useState } from "react";
import { Check, FileText, Folder, Image as ImageIcon, Paperclip } from "lucide-react";
import styles from "./auth.module.css";

export function AuthRoomPreview() {
  const [view, setView] = useState<"files" | "note">("files");
  return <div className={styles.preview}>
    <div className={styles.previewCaption}><span>Inside a Woff room</span><span>Interactive preview</span></div>
    <div className={styles.room}>
      <div className={styles.roomHeader}><div className={styles.folder}><Folder size={22} strokeWidth={1.5} /></div><div><strong>The next big thing</strong><span>A few things worth sharing</span></div><span className={styles.example}>Example</span></div>
      <div className={styles.previewSwitch} aria-label="Preview content">
        <button type="button" aria-pressed={view === "files"} aria-controls="auth-preview-content" onClick={() => setView("files")}><Paperclip size={13} /> Files <span>2</span></button>
        <button type="button" aria-pressed={view === "note"} aria-controls="auth-preview-content" onClick={() => setView("note")}><FileText size={13} /> Note <span>1</span></button>
      </div>
      <div id="auth-preview-content" className={styles.previewContent}>
        {view === "files" ? <div key="files" className={styles.previewReveal}>
          <div className={styles.fileRow}><div className={styles.artThumbnail} aria-hidden="true"><span /><span /></div><div><strong>Something-good.png</strong><span>Image · 2.4 MB</span></div><Check size={15} className={styles.fileCheck} /></div>
          <div className={styles.fileRow}><div className={styles.docThumbnail}><FileText size={20} strokeWidth={1.4} /></div><div><strong>The-final-final.pdf</strong><span>Document · 840 KB</span></div><Check size={15} className={styles.fileCheck} /></div>
        </div> : <div key="note" className={`${styles.previewReveal} ${styles.previewNote}`}><span>A note for you</span><p>Here&apos;s everything we talked about.<br />The files, the details, the next step.</p><div><ImageIcon size={14} /> All in one shared room.</div></div>}
      </div>
      <div className={styles.roomFooter}><span className={styles.roomDot} /> A link is all it takes.</div>
    </div>
  </div>;
}
