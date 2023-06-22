// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { produce } from "immer";
import { useCallback, useEffect } from "react";

import { useGuaranteedContext } from "@foxglove/hooks";
import {
  WorkspaceContext,
  WorkspaceContextStore,
} from "@foxglove/studio-base/context/Workspace/WorkspaceContext";

export function useConnectionStatus(): void {
  const { setState } = useGuaranteedContext(WorkspaceContext);

  const setConnectionStatus = useCallback(
    (status: WorkspaceContextStore["connectionStatus"]) => {
      setState(
        produce<WorkspaceContextStore>((draft) => {
          draft.connectionStatus = status;
        }),
      );
    },
    [setState],
  );

  useEffect(() => {
    const { addEventListener } = window;

    addEventListener("offline", () => setConnectionStatus("offline"));
    addEventListener("online", () => setConnectionStatus("online"));

    return () => {
      removeEventListener("offline", () => setConnectionStatus("offline"));
      removeEventListener("online", () => setConnectionStatus("online"));
    };
  }, [setConnectionStatus]);
}
