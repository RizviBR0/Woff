"use client";

import styles from "./BentoGrid.module.css";
import { FaShieldAlt } from "react-icons/fa";

const cards = [
  {
    className: styles.cardSecure,
    title: "Passcode Protected",
    text: "Keep shared spaces locked down. Only people with the room code can enter.",
    visual: <ShieldVisual />,
  },
  {
    className: styles.cardNotes,
    title: "Real-time Markdown Notes",
    text: "Draft ideas, write documentation, and collaborate in the same instant workspace.",
    visual: <ChartVisual />,
  },
  {
    className: styles.cardFiles,
    title: "Files & Images",
    text: "Drop files, images, and quick assets without compression, setup, or friction.",
    visual: <DropVisual />,
  },
  {
    className: styles.cardShare,
    title: "Zero Friction Sharing",
    text: "Create a space, paste content, scan the QR, or share the link instantly.",
    visual: <OrbitVisual />,
  },
];

export default function BentoGrid() {
  return (
    <section className={styles.bentoSection} id="features">
      <div className={styles.header}>
        <span className={styles.badge}>
          <SparkIcon />
          Everything you need
        </span>

        <h2>A workspace for every thought</h2>

        <p>
          Share notes, files, images, and code snippets in an instant. Woff is
          designed to be the quickest way to move data from A to B.
        </p>
      </div>

      <div className={styles.grid}>
        {cards.map((card) => (
          <article key={card.title} className={`${styles.card} ${card.className}`}>
            <div className={styles.visual}>{card.visual}</div>

            <div className={styles.copy}>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ShieldVisual() {
  return (
    <div className={styles.shieldWrap}>
      <div className={styles.shieldLines}>
        <span />
        <span />
        <span />
      </div>
      <svg viewBox="0 0 120 140" className={styles.shieldIcon}>
        <defs>
          <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff9e0011" />
            <stop offset="100%" stopColor="#ff5a0088" />
          </linearGradient>
        </defs>
        <path d="M60 8L104 25V62C104 95 83 122 60 132C37 122 16 95 16 62V25L60 8Z" />
      </svg>
    </div>
  );
}

function ChartVisual() {
  return (
    <div className={styles.chart}>
      <div className={styles.chartTop}>
        <div>
          <strong>4.2k</strong>
          <span>Shared items</span>
        </div>
        <em>+90%</em>
      </div>

      <svg viewBox="0 0 520 210">
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ff5a00" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ff5a00" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className={styles.gridLine} d="M30 45H500M30 95H500M30 145H500" />
        <path
          className={styles.chartArea}
          d="M30 165L100 138L155 128L190 70L255 36L325 68L375 44L430 92L465 26L500 15V195H30Z"
        />
        <path
          className={styles.chartLine}
          d="M30 165L100 138L155 128L190 70L255 36L325 68L375 44L430 92L465 26L500 15"
        />
        <circle cx="375" cy="44" r="8" />
        <line x1="375" y1="44" x2="375" y2="178" />
        <text x="350" y="22">Live</text>
      </svg>
    </div>
  );
}

function DropVisual() {
  return (
    <div className={styles.dropScene}>
      {/* File Card */}
      <div className={styles.fileCard}>
        <div className={styles.fileHeader}>
          <FileTextIcon />
        </div>
        <div className={styles.fileLines}>
          <span className={styles.fileLine} />
          <span className={styles.fileLine} />
          <span className={styles.fileLine} />
          <span className={styles.fileLine} />
        </div>
      </div>

      {/* Image Card */}
      <div className={styles.imageCard}>
        <div className={styles.imageInner}>
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="imageBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(32, 215, 255, 0.25)" />
                <stop offset="100%" stopColor="rgba(184, 108, 255, 0.05)" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#imageBgGrad)" />
            {/* Background Mountains */}
            <path d="M5 90L35 48L65 78L78 63L95 90H5Z" fill="var(--orange)" opacity="0.4" />
            {/* Foreground Mountains */}
            <path d="M20 90L45 58L65 80L75 70L95 90H20Z" fill="var(--orange)" opacity="0.8" />
            {/* Glowing Sun */}
            <circle cx="72" cy="32" r="9" fill="var(--cyan)" opacity="0.85" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function FileTextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="var(--orange)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function OrbitVisual() {
  return (
    <div className={styles.orbit}>
      <span className={styles.orbitRingOne} />
      <span className={styles.orbitRingTwo} />
      <span className={styles.planetCenter}>W</span>
      <span className={styles.planetOne}><QrIcon /></span>
      <span className={styles.planetTwo}><PasteIcon /></span>
      <span className={styles.planetThree}><ShareIcon /></span>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
    </svg>
  );
}

function QrIcon() {
  return <svg viewBox="0 0 24 24"><path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm11 1h2v2h-2v-2zm4 0h1v5h-5v-1h4v-4z" /></svg>;
}

function PasteIcon() {
  return <svg viewBox="0 0 24 24"><path d="M9 4h6l1 2h3v15H5V6h3l1-2zm0 2h6" /></svg>;
}

function ShareIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 3v12m0-12l5 5m-5-5L7 8M5 13v7h14v-7" /></svg>;
}
