# Authentication illustration assets

Created October 7, 2026 from the user's supplied [Woff sign-in design reference](<C:/Users/sabbi/Downloads/WOFF Neon File-Sharing Sign-In.png>). The user requested this illustration style for the account pages. These are page artwork assets; functional forms, navigation, labels and buttons stay in React with plain UI copy.

The **built-in image generation tool** generated both images in separate calls. No external API key or paid CLI fallback was used. Sign-in uses the supplied image as an edit target to restore only its left-side artwork. Sign-up uses that extracted artwork as a style/composition reference for distinct profile and key tiles. Both retain the black 3D machine/conveyor, orange cloud, warm rim lights and the small embossed machine wordmark. The top-left page logo, right-side form and outer page frame are omitted so the page can supply its real logo and controls.

Both generated and optimized outputs were visually inspected. Sharp performed only aspect-preserving resizing and WebP conversion; no code-based image editing, crop, compositing or repainting was used. WebP settings: width 864 px, no enlargement, quality 90, effort 6.

## Saved project files

| Asset | Workspace path | Dimensions | Bytes |
| --- | --- | --- | --- |
| Sign-in deployed artwork | [../public/auth/sign-in-art.webp](../public/auth/sign-in-art.webp) | 864 × 1200 | 57,738 |
| Sign-up deployed artwork | [../public/auth/sign-up-art.webp](../public/auth/sign-up-art.webp) | 864 × 1200 | 58,444 |
| Sign-in PNG source, ignored by deployment | [../internal/auth-artwork/sign-in-art-source.png](../internal/auth-artwork/sign-in-art-source.png) | 1064 × 1478 | 1,535,457 |
| Sign-up PNG source, ignored by deployment | [../internal/auth-artwork/sign-up-art-source.png](../internal/auth-artwork/sign-up-art-source.png) | 1064 × 1478 | 1,527,592 |

Only the compact WebP files belong in the public asset bundle. The original generated files also remain under the Codex generated-images directory; workspace PNG copies preserve the source without deploying multi-megabyte files. These illustrations are decorative; use an empty image alt value where the adjacent real interface supplies the page meaning.

## Final sign-in prompt

```text
Use case: precise-object-edit.
Asset type: portrait illustration asset for the LEFT panel of a Woff sign-in webpage.
Input image 1: edit target, the supplied full sign-in reference.
Primary request: extract only the reference's LEFT illustration as a standalone portrait image. This is a faithful extraction/restoration task, not a redesign. Output just the left panel artwork at about 0.72 width-to-height ratio.
Preserve exactly the original left-side composition: black rounded 3D file-sharing machine right of center, its embossed Woff wordmark above the glowing orange arched opening, bright orange cloud on top, orange folder coming from the opening, matte black image and play-video tiles on the conveyor, cream paper tile nearer the foreground, dark conveyor running diagonally from lower-left toward the machine, orange glowing circular rollers, tiny floating chain-link/QR/lightning tiles and orange sparks, deep black background with warm orange illumination and subtle cool highlights on the machine.
Changes allowed: omit the entire right sign-in form panel; remove the white/orange Woff logo located at the upper-left of the page and restore plain dark background behind it; remove outer rounded page borders/frame and vertical divider.
Framing: same crop and scale as the original left artwork, preserve all central machine and conveyor geometry. Generous black negative space at top where the separate live page logo will be overlaid.
Text: retain only the embossed machine wordmark "Woff"; no other text.
Avoid: any UI, forms, navigation, buttons, login labels, password fields, extra logos, watermarks, badges, changed camera perspective or rearranged tiles. Opaque dark background.
```

## Final sign-up prompt

```text
Use case: stylized-concept.
Asset type: portrait left-side illustration for the Woff create-account webpage; one standalone artwork, about 0.72 width-to-height ratio.
Input image 1: STYLE AND COMPOSITION reference only, the Woff sign-in illustration. Create a second matching artwork with a distinct account-creation subject, not a duplicate.
Scene/backdrop: deep near-black background with restrained orange ambient glow and tiny orange sparks. Preserve generous empty black space at the top for the live Woff page logo.
Subject: a matte black rounded secure file tray/machine right of center, with a bright orange cloud on top, a warm orange arched assembly slot, and orange file folders inside. A dark segmented conveyor runs diagonally from the lower left toward this machine, with luminous orange circular rollers and metallic orange rim lights.
Account-creation story: a substantial dark rounded profile tile showing a simple orange head-and-shoulders silhouette with a small orange plus symbol is being assembled into the tray, accompanied by a finely rendered warm-orange key tile and one cream document tile on the conveyor. Small floating dark square tiles around the scene show a chain-link icon, a simple key icon and a lightning icon. No people.
Style/medium: polished cinematic isometric 3D product illustration, exactly matching the reference's viewpoint, bevels, proportions, physical materials, orange lighting and realistic soft reflections. Matte black metal, smooth dark rubber conveyor, translucent warm orange cloud, lightly glowing orange edges. Subject occupies the middle/lower part of the portrait with the same scale and direction as the reference.
Text: only a small embossed "Woff" wordmark on the machine, white with an orange O; no other text.
Constraints: one coherent scene; no outer card frame or border, no navigation, no upper-left logo, no form, no buttons, no fields, no password symbols, no two-panel layout, no watermark. Opaque dark background. Keep the reference palette: black, charcoal, warm #ff5a00 orange, cream paper and subtle cool dark-metal highlights.
```
