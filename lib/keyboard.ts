export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable='true']")) return true;

  const tag = target.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;

  if (tag === "input") {
    const input = target as HTMLInputElement;
    const nonTextInputTypes = new Set([
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ]);
    return !nonTextInputTypes.has(input.type);
  }

  return false;
}

type ModifierEvent = { metaKey: boolean; ctrlKey: boolean };

export function hasCommandModifier(event: ModifierEvent): boolean {
  return event.metaKey || event.ctrlKey;
}
