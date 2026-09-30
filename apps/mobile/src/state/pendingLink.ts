import { create } from "zustand";
import type { DeepLink } from "../lib/links";

/** A deep link received while signed out (or before onboarding finished); applied afterwards. */
export const usePendingLink = create<{ link: DeepLink | null }>(() => ({ link: null }));

export function setPendingLink(link: DeepLink | null): void {
  usePendingLink.setState({ link });
}
