import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type DraftValues = Record<string, string | boolean>;

const draftFieldKey = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  if (element.name) return `name:${element.name}`;
  if (element.id) return `id:${element.id}`;

  const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input:not([type='hidden']), textarea, select",
  ));
  return `position:${fields.indexOf(element)}:${element.type}`;
};

const canPersist = (element: EventTarget | null): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
  if (element.dataset.noDraft !== undefined || element.disabled) return false;
  if (element instanceof HTMLInputElement && ["password", "file", "hidden", "submit", "button", "reset"].includes(element.type)) return false;
  return true;
};

/**
 * Preserves unfinished form entries while the user navigates inside the app.
 * This is deliberately browser-local, account-scoped and excludes secrets/files.
 */
export function FormDraftPersistence() {
  const location = useLocation();
  const { user } = useAuth();
  const storageKey = `smart-mill:form-draft:${user?.id ?? "anonymous"}:${location.pathname}`;

  useEffect(() => {
    const read = (): DraftValues => {
      try {
        return JSON.parse(sessionStorage.getItem(storageKey) || "{}") as DraftValues;
      } catch {
        return {};
      }
    };

    const write = (values: DraftValues) => {
      if (Object.keys(values).length === 0) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify(values));
    };

    const persist = (event: Event) => {
      if (!canPersist(event.target)) return;
      const values = read();
      values[draftFieldKey(event.target)] = event.target instanceof HTMLInputElement && event.target.type === "checkbox"
        ? event.target.checked
        : event.target.value;
      write(values);
    };

    const restore = () => {
      const values = read();
      for (const element of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input:not([type='hidden']), textarea, select")) {
        if (!canPersist(element)) continue;
        const value = values[draftFieldKey(element)];
        if (value === undefined) continue;
        if (element instanceof HTMLInputElement && element.type === "checkbox") {
          if (element.checked === value) continue;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
          setter?.call(element, value);
          element.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          const stringValue = String(value);
          if (element.value === stringValue) continue;
          const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, stringValue);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    };

    const clear = (event: Event) => {
      const requestedPath = (event as CustomEvent<string | undefined>).detail;
      if (!requestedPath || requestedPath === location.pathname) sessionStorage.removeItem(storageKey);
    };

    document.addEventListener("input", persist, true);
    document.addEventListener("change", persist, true);
    window.addEventListener("smart-mill:clear-form-draft", clear);
    const timer = window.setTimeout(restore, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("input", persist, true);
      document.removeEventListener("change", persist, true);
      window.removeEventListener("smart-mill:clear-form-draft", clear);
    };
  }, [location.pathname, storageKey]);

  return null;
}
