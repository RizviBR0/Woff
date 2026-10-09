export const HANDOFF_SECTIONS = [
  ["Project", "Client: Add your client name\nDelivery: Describe this delivery"],
  ["Included files", "List the files attached to this room."],
  ["What to review", "Explain the decision or feedback you need."],
  ["Next action", "Add the next step and its due date."],
  ["Keep a copy", "Download the files and export this note before the room expires. Keep your original project files elsewhere."],
];
export const HANDOFF_HTML = HANDOFF_SECTIONS.map(([heading, text]) => `<h2>${heading}</h2><p>${text.replace(/\n/g, "<br>")}</p>`).join("");
export const HANDOFF_JSON = {
  type: "doc",
  content: HANDOFF_SECTIONS.flatMap(([heading, text]) => [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: heading }] },
    { type: "paragraph", content: text.split("\n").flatMap((line, index) => index ? [{ type: "hardBreak" }, { type: "text", text: line }] : [{ type: "text", text: line }]) },
  ]),
};
