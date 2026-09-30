import { useEffect } from "react";
import { onSynced, useForegroundSync } from "../sync";
import { keysAfterUpload } from "../lib/queryKeys";
import { invalidateKeys } from "../realtime/invalidate";
import { useRealtime } from "../realtime/useRealtime";
import { useApplyPendingLink } from "./useDeepLinks";

/** Mounted once while signed in: foreground sync, realtime socket, sync -> query invalidation, pending links. */
export function SignedInEffects({ navReady }: { navReady: boolean }) {
  useForegroundSync();
  useRealtime();
  useApplyPendingLink(navReady);
  useEffect(() => onSynced(() => invalidateKeys(keysAfterUpload())), []);
  return null;
}
